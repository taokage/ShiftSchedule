from io import BytesIO
from pathlib import Path
from zipfile import BadZipFile
from datetime import date, datetime

import numpy as np
from fastapi import Body, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.utils.exceptions import InvalidFileException
from openpyxl.worksheet.datavalidation import DataValidation
from ortools.sat.python import cp_model
from pydantic import BaseModel, Field, field_validator

from shift_schedule_exporter import export_final_work_3d
from shift_schedule_loader import load_shift_schedule_excel
from shift_schedule_solver import solve_shift_schedule

N_STAFF, N_DAYS, N_SHIFTS = 30, 31, 2

REQUEST_CHOICES = [
    ("unavailable", "×"),
    ("avoid", "△"),
    ("available", "○"),
    ("mandatory", "勤務"),
    ("want", "勤務希望"),
    ("research", "研究日希望"),
    ("regular_outside", "通常外勤"),
    ("ew1", "西大寺勤務"),
    ("ew2", "薬師寺勤務"),
    ("ew3", "吉備勤務"),
    ("iw1", "クリクラ"),
]
REQUEST_TO_LABEL = dict(REQUEST_CHOICES)
LABEL_TO_REQUEST = {label: value for value, label in REQUEST_CHOICES}

class StaffInput(BaseModel):
    no: int = 0
    name: str = ""
    leader_level: int = Field(0, ge=0, le=2)
    # EW1/IW1 は現行solverに接続。EW2/IW2 は管理情報として保持し、
    # 将来solverを拡張するときにそのまま利用できるようAPIでも受け取る。
    ew1_candidate: bool = False
    ew1_available: bool = False
    ew2_available: bool = False
    iw1_priority: int = Field(0, ge=0, le=3)
    iw1_available: bool = False
    iw2_available: bool = False
    target_day: int = Field(0, ge=0, le=31)
    target_night: int = Field(0, ge=0, le=31)

class ScheduleInput(BaseModel):
    dates: list[str]
    staff: list[StaffInput]
    requests: list[list[list[str]]]
    coverage: list[list[dict[str, int]]]
    night_pair_ng: list[list[int]] = []
    @field_validator("dates")
    @classmethod
    def dates_are_31(cls, value):
        if len(value) != N_DAYS: raise ValueError("日付は31日分必要です。")
        return value
    @field_validator("staff")
    @classmethod
    def staff_are_30_or_less(cls, value):
        if not 1 <= len(value) <= N_STAFF: raise ValueError("スタッフは1〜30名で入力してください。")
        return value

class RequestExcelInput(BaseModel):
    dates: list[str]
    staff: list[StaffInput]
    requests: list[list[list[str]]]
    remarks: list[list[list[str]]]
    holiday_labels: list[str] = []

    @field_validator("dates")
    @classmethod
    def request_dates_are_31(cls, value):
        if len(value) != N_DAYS:
            raise ValueError("日付は31日分必要です。")
        return value

app = FastAPI(title="Shift Schedule API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/")
def root(): return {"message": "Shift Schedule Backend", "status": "running"}

@app.get("/health")
def health(): return {"status": "ok"}

def arrays_from_payload(payload):
    unavailable = np.ones((N_STAFF, N_DAYS, N_SHIFTS), dtype=bool)
    avoid = np.zeros_like(unavailable); mandatory = np.zeros_like(unavailable)
    ew1_mandatory = np.zeros_like(unavailable); iw1_mandatory = np.zeros_like(unavailable)
    optimal = np.zeros((N_STAFF, N_SHIFTS), dtype=int)
    leader = np.zeros(N_STAFF, dtype=int); ew1_candidate = np.zeros(N_STAFF, dtype=bool)
    iw1_priority = np.zeros(N_STAFF, dtype=int); staffno = np.arange(1, N_STAFF + 1, dtype=int)
    staffname = np.full(N_STAFF, "", dtype=object)
    for s, member in enumerate(payload.staff):
        staffno[s] = member.no or s + 1; staffname[s] = member.name.strip()
        leader[s] = member.leader_level
        ew1_candidate[s] = bool(member.ew1_available or member.ew1_candidate)
        iw1_priority[s] = member.iw1_priority if member.iw1_available else 0
        optimal[s] = [member.target_day, member.target_night]
        if member.name.strip():
            unavailable[s, :, :] = False
            for d in range(min(N_DAYS, len(payload.requests[s]))):
                for sh in range(N_SHIFTS):
                    state = payload.requests[s][d][sh]
                    unavailable[s,d,sh] = state == "unavailable"
                    avoid[s,d,sh] = state == "avoid"; mandatory[s,d,sh] = state == "mandatory"
    min_work = np.zeros((N_DAYS,N_SHIFTS),dtype=int); min_leader=np.zeros_like(min_work)
    ew1_count=np.zeros_like(min_work); iw1_count=np.zeros_like(min_work)
    for d, shifts in enumerate(payload.coverage[:N_DAYS]):
        for sh, item in enumerate(shifts[:N_SHIFTS]):
            min_work[d,sh]=max(0,int(item.get("minimum",0))); min_leader[d,sh]=max(0,int(item.get("leaders",0)))
            ew1_count[d,sh]=max(0,int(item.get("ew1",0))); iw1_count[d,sh]=max(0,int(item.get("iw1",0)))
    day_week=np.empty((N_DAYS,2),dtype=object); weekdays="月火水木金土日"
    for d, raw in enumerate(payload.dates):
        parsed=date.fromisoformat(raw); day_week[d]=[raw,weekdays[parsed.weekday()]]
    pair_ng=np.zeros((N_STAFF,N_STAFF),dtype=bool)
    for pair in payload.night_pair_ng:
        if len(pair)==2 and all(0<=x<N_STAFF for x in pair): pair_ng[pair[0],pair[1]]=pair_ng[pair[1],pair[0]]=True
    return (unavailable,avoid,mandatory,ew1_mandatory,iw1_mandatory,optimal,min_work,min_leader,ew1_count,iw1_count,staffno,staffname,leader,ew1_candidate,iw1_priority,day_week,pair_ng)

def solve_payload(payload):
    a=arrays_from_payload(payload)
    unavailable,avoid,mandatory,ew1m,iw1m,optimal,min_work,min_leader,ew1c,iw1c,staffno,staffname,leader,is_ew1,iw1p,day_week,pair_ng=a
    work,ew1,iw1,status=solve_shift_schedule(unavailable,avoid,mandatory,ew1m,iw1m,optimal,min_work,min_leader,ew1c,iw1c,staffno,leader,is_ew1,iw1p,pair_ng)
    if status not in (cp_model.OPTIMAL,cp_model.FEASIBLE): raise HTTPException(422,"条件を満たす勤務表が見つかりません。必要人数や勤務不可を確認してください。")
    return a,work,ew1,iw1


def _request_excel_workbook(payload: RequestExcelInput):
    wb = Workbook()
    ws = wb.active
    ws.title = "勤務希望入力"
    option_ws = wb.create_sheet("選択肢")
    for row, (_, label) in enumerate(REQUEST_CHOICES, start=1):
        option_ws.cell(row=row, column=1, value=label)
    option_ws.sheet_state = "hidden"

    thin = Side(style="thin", color="D6DCE4")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    # 勤務者と勤務者の境界線
    staff_separator = Side(style="medium", color="000000")

    header_fill = PatternFill("solid", fgColor="E9EEF5")
    sub_fill = PatternFill("solid", fgColor="F5F7FA")
    holiday_fill = PatternFill("solid", fgColor="FFF1F1")
    remark_fill = PatternFill("solid", fgColor="FAFAFA")
    locked_fill = PatternFill("solid", fgColor="F1F3F5")

    ws["A1"] = "勤務者ID"
    ws["A2"] = "勤務者名"
    ws["A3"] = "日勤・夜勤"
    for row in range(1, 4):
        for col in range(1, 5):
            ws.cell(row=row, column=col).fill = header_fill
            ws.cell(row=row, column=col).border = border
            ws.cell(row=row, column=col).font = Font(bold=True)
            ws.cell(row=row, column=col).alignment = Alignment(horizontal="center", vertical="center")

    for i in range(N_STAFF):
        col = 5 + i * 2
        name = payload.staff[i].name if i < len(payload.staff) else ""
        ws.merge_cells(start_row=1, start_column=col, end_row=1, end_column=col + 1)
        ws.merge_cells(start_row=2, start_column=col, end_row=2, end_column=col + 1)
        ws.cell(1, col, i)
        ws.cell(2, col, name)
        ws.cell(3, col, "日勤")
        ws.cell(3, col + 1, "夜勤")
        for row in (1, 2):
            cell = ws.cell(row, col)
            cell.fill = header_fill
            cell.border = border
            cell.font = Font(bold=True)
            cell.alignment = Alignment(horizontal="center", vertical="center")
        for c in (col, col + 1):
            ws.cell(3, c).fill = sub_fill
            ws.cell(3, c).border = border
            ws.cell(3, c).font = Font(bold=True)
            ws.cell(3, c).alignment = Alignment(horizontal="center", vertical="center")

    dropdown = DataValidation(
        type="list",
        formula1="'選択肢'!$A$1:$A$11",
        allow_blank=False,
    )
    dropdown.error = "一覧から勤務希望を選択してください。"
    dropdown.errorTitle = "勤務希望の入力エラー"
    dropdown.prompt = "勤務希望をドロップダウンから選択してください。"
    dropdown.promptTitle = "勤務希望"
    ws.add_data_validation(dropdown)

    weekdays = "月火水木金土日"
    for d, raw_date in enumerate(payload.dates):
        request_row = 4 + d * 2
        remark_row = request_row + 1
        parsed = date.fromisoformat(raw_date)
        holiday_label = (
            payload.holiday_labels[d]
            if d < len(payload.holiday_labels) and payload.holiday_labels[d] in {"平日", "休日"}
            else ("休日" if parsed.weekday() >= 5 else "平日")
        )
        ws.cell(request_row, 1, d)
        ws.cell(request_row, 2, parsed)
        ws.cell(request_row, 3, weekdays[parsed.weekday()])
        ws.cell(request_row, 4, holiday_label)
        ws.cell(remark_row, 4, "備考")
        ws.cell(request_row, 2).number_format = "yyyy/mm/dd"

        base_fill = holiday_fill if holiday_label == "休日" else PatternFill(fill_type=None)
        for col in range(1, 5):
            ws.cell(request_row, col).border = border
            ws.cell(request_row, col).fill = base_fill
            ws.cell(request_row, col).alignment = Alignment(horizontal="center", vertical="center")
            ws.cell(remark_row, col).border = border
            ws.cell(remark_row, col).fill = remark_fill
            ws.cell(remark_row, col).alignment = Alignment(horizontal="center", vertical="center")

        for i in range(N_STAFF):
            for sh in range(N_SHIFTS):
                col = 5 + i * 2 + sh
                state = "available"
                if i < len(payload.requests) and d < len(payload.requests[i]) and sh < len(payload.requests[i][d]):
                    state = payload.requests[i][d][sh]
                label = REQUEST_TO_LABEL.get(state, "○")
                ws.cell(request_row, col, label)
                remark = ""
                if i < len(payload.remarks) and d < len(payload.remarks[i]) and sh < len(payload.remarks[i][d]):
                    remark = payload.remarks[i][d][sh] or ""
                ws.cell(remark_row, col, remark)
                ws.cell(request_row, col).border = border
                ws.cell(request_row, col).fill = base_fill
                ws.cell(request_row, col).alignment = Alignment(horizontal="center", vertical="center")
                ws.cell(remark_row, col).border = border
                ws.cell(remark_row, col).fill = remark_fill
                ws.cell(remark_row, col).alignment = Alignment(horizontal="left", vertical="center")
                dropdown.add(ws.cell(request_row, col))

    # --------------------------------------------------
    # 勤務者ごとの境界線を太くする
    # 各勤務者は「日勤・夜勤」の2列なので、夜勤列の右端を太線にする
    # --------------------------------------------------
    for i in range(N_STAFF):
        night_col = 5 + i * 2 + 1

        for row in range(1, 66):
            cell = ws.cell(row=row, column=night_col)

            cell.border = Border(
                left=cell.border.left,
                right=staff_separator,
                top=cell.border.top,
                bottom=cell.border.bottom,
            )
            
    ws.freeze_panes = "E4"
    ws.column_dimensions["A"].width = 7
    ws.column_dimensions["B"].width = 13
    ws.column_dimensions["C"].width = 7
    ws.column_dimensions["D"].width = 10
    for col in range(5, 5 + N_STAFF * 2):
        ws.column_dimensions[get_column_letter(col)].width = 13
    for row in range(1, 66):
        ws.row_dimensions[row].height = 22
    ws.row_dimensions[1].height = 24
    ws.row_dimensions[2].height = 26
    ws.row_dimensions[3].height = 24

    ws.sheet_view.showGridLines = False
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    return wb


def _parse_request_excel(content: bytes):
    try:
        wb = load_workbook(BytesIO(content), data_only=False)
    except Exception as exc:
        raise HTTPException(400, f"Excelファイルを開けません: {exc}") from exc
    ws = wb["勤務希望入力"] if "勤務希望入力" in wb.sheetnames else wb[wb.sheetnames[0]]

    if ws.max_row < 65 or ws.max_column < 6:
        raise HTTPException(400, "勤務希望Excelの行列数が不足しています。Web画面から出力したExcelを使用してください。")

    staff_names = []
    for i in range(N_STAFF):
        col = 5 + i * 2
        staff_names.append(str(ws.cell(2, col).value or "").strip())

    dates = []
    requests = []
    remarks = []
    for i in range(N_STAFF):
        requests.append([["available", "available"] for _ in range(N_DAYS)])
        remarks.append([["", ""] for _ in range(N_DAYS)])

    for d in range(N_DAYS):
        request_row = 4 + d * 2
        remark_row = request_row + 1
        raw = ws.cell(request_row, 2).value
        if isinstance(raw, datetime):
            parsed = raw.date()
        elif isinstance(raw, date):
            parsed = raw
        elif isinstance(raw, str):
            value = raw.strip().replace("/", "-")
            try:
                parsed = date.fromisoformat(value)
            except ValueError as exc:
                raise HTTPException(400, f"B{request_row} の日付が正しくありません: {raw}") from exc
        else:
            raise HTTPException(400, f"B{request_row} に日付がありません。")
        dates.append(parsed.isoformat())

        for i in range(N_STAFF):
            for sh in range(N_SHIFTS):
                col = 5 + i * 2 + sh
                raw_choice = str(ws.cell(request_row, col).value or "○").strip()
                if raw_choice not in LABEL_TO_REQUEST:
                    coord = ws.cell(request_row, col).coordinate
                    raise HTTPException(
                        400,
                        f"{coord} の勤務希望「{raw_choice}」は選択肢にありません。ドロップダウンから選択してください。",
                    )
                requests[i][d][sh] = LABEL_TO_REQUEST[raw_choice]
                remarks[i][d][sh] = str(ws.cell(remark_row, col).value or "")

    return {
        "dates": dates,
        "staff_names": staff_names,
        "requests": requests,
        "remarks": remarks,
    }


@app.post("/requests/export")
def export_requests_excel(payload: RequestExcelInput = Body(...)):
    workbook = _request_excel_workbook(payload)
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="shift_request_input.xlsx"'},
    )


@app.post("/requests/import")
async def import_requests_excel(file: UploadFile = File(...)):
    if Path(file.filename or "").suffix.lower() not in {".xlsx", ".xlsm"}:
        raise HTTPException(400, ".xlsx または .xlsm ファイルを選択してください。")
    try:
        content = await file.read()
        if not content:
            raise HTTPException(400, "ファイルが空です。")
        return _parse_request_excel(content)
    finally:
        await file.close()


@app.post("/schedule/solve")
def solve_from_web(payload: ScheduleInput = Body(...)):
    a,work,ew1,iw1=solve_payload(payload); unavailable=a[0]; rows=[]
    for d,raw in enumerate(payload.dates):
        cells=[]
        for s,_ in enumerate(payload.staff):
            values=[]
            for sh in range(N_SHIFTS):
                if unavailable[s,d,sh]: values.append("×")
                elif ew1[s,d,sh]: values.append("外1")
                elif iw1[s,d,sh]: values.append("内1")
                elif work[s,d,sh]: values.append("日" if sh==0 else "夜")
                else: values.append("")
            cells.append(values)
        rows.append({"date":raw,"cells":cells})
    return {"status":"feasible","rows":rows}

@app.post("/schedule/export")
def export_from_web(payload: ScheduleInput = Body(...)):
    a,work,ew1,iw1=solve_payload(payload); unavailable=a[0]; staffno=a[10]; staffname=a[11]; day_week=a[15]
    output=BytesIO(); export_final_work_3d(work,ew1,iw1,unavailable,staffno,staffname,day_week,output); output.seek(0)
    return StreamingResponse(output,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",headers={"Content-Disposition":'attachment; filename="read_work.xlsx"'})

@app.post("/schedule/generate")
async def generate_schedule(file: UploadFile = File(...)):
    if Path(file.filename or "").suffix.lower() not in {".xlsx",".xlsm"}: raise HTTPException(400,".xlsx または .xlsm ファイルを選択してください。")
    try:
        content=await file.read()
        if not content: raise HTTPException(400,"ファイルが空です。")
        v=load_shift_schedule_excel(BytesIO(content)); unavailable,avoid,mandatory,ew1m,iw1m,optimal,min_work,min_leader,ew1c,iw1c,staffno,staffname,leader,is_ew1,iw1p,day_week,pair_ng,_=v
        work,ew1,iw1,status=solve_shift_schedule(unavailable,avoid,mandatory,ew1m,iw1m,optimal,min_work,min_leader,ew1c,iw1c,staffno,leader,is_ew1,iw1p,pair_ng)
        if status not in (cp_model.OPTIMAL,cp_model.FEASIBLE): raise HTTPException(422,"条件を満たすシフトが見つかりません。")
        output=BytesIO(); export_final_work_3d(work,ew1,iw1,unavailable,staffno,staffname,day_week,output); output.seek(0)
        return StreamingResponse(output,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",headers={"Content-Disposition":'attachment; filename="shift_schedule_result.xlsx"'})
    except HTTPException: raise
    except (BadZipFile,InvalidFileException,KeyError,TypeError,ValueError) as exc: raise HTTPException(400,f"Excelファイルの形式または内容が正しくありません: {exc}") from exc
    finally: await file.close()
