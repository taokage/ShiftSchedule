from io import BytesIO
from pathlib import Path
from zipfile import BadZipFile
from datetime import date

import numpy as np
from fastapi import Body, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openpyxl.utils.exceptions import InvalidFileException
from ortools.sat.python import cp_model
from pydantic import BaseModel, Field, field_validator

from shift_schedule_exporter import export_final_work_3d
from shift_schedule_loader import load_shift_schedule_excel
from shift_schedule_solver import solve_shift_schedule

N_STAFF, N_DAYS, N_SHIFTS = 30, 31, 2

class StaffInput(BaseModel):
    no: int = 0
    name: str = ""
    leader_level: int = Field(0, ge=0, le=2)
    ew1_candidate: bool = False
    iw1_priority: int = Field(0, ge=0, le=3)
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
        leader[s] = member.leader_level; ew1_candidate[s] = member.ew1_candidate
        iw1_priority[s] = member.iw1_priority; optimal[s] = [member.target_day, member.target_night]
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
