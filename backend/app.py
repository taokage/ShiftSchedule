from io import BytesIO
from pathlib import Path
from zipfile import BadZipFile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openpyxl.utils.exceptions import InvalidFileException
from ortools.sat.python import cp_model

from shift_schedule_exporter import export_final_work_3d
from shift_schedule_loader import load_shift_schedule_excel
from shift_schedule_solver import solve_shift_schedule

app = FastAPI(title="Shift Schedule API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Shift Schedule Backend", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/schedule/generate")
async def generate_schedule(file: UploadFile = File(...)):
    """入力Excelから勤務表を生成し、Excelファイルとして返す。"""
    if Path(file.filename or "").suffix.lower() not in {".xlsx", ".xlsm"}:
        raise HTTPException(status_code=400, detail=".xlsx または .xlsm ファイルを選択してください。")

    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="ファイルが空です。")

        (
            unavailable_3d, avoid_3d, mandatory_3d,
            ew1_mandatory_3d, iw1_mandatory_3d, optimal_staff_2d,
            min_work_count_2d, min_leader_count_2d, ew1_count_2d,
            iw1_count_2d, staffno_1d, staffname_1d, leader_level_1d,
            is_ew1_candidate_1d, iw1_priority_1d, day_week_2d,
            night_pair_ng_2d, _,
        ) = load_shift_schedule_excel(BytesIO(content))

        final_work, final_ew1, final_iw1, status = solve_shift_schedule(
            unavailable_3d=unavailable_3d, avoid_3d=avoid_3d,
            mandatory_3d=mandatory_3d, ew1_mandatory_3d=ew1_mandatory_3d,
            iw1_mandatory_3d=iw1_mandatory_3d, optimal_staff_2d=optimal_staff_2d,
            min_work_count_2d=min_work_count_2d,
            min_leader_count_2d=min_leader_count_2d, ew1_count_2d=ew1_count_2d,
            iw1_count_2d=iw1_count_2d, staffno_1d=staffno_1d,
            leader_level_1d=leader_level_1d, is_ew1_candidate_1d=is_ew1_candidate_1d,
            iw1_priority_1d=iw1_priority_1d, night_pair_ng_2d=night_pair_ng_2d,
        )

        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            raise HTTPException(
                status_code=422,
                detail="条件を満たすシフトが見つかりませんでした。入力条件を確認してください。",
            )

        output = BytesIO()
        export_final_work_3d(
            final_work_3d=final_work, final_ew1_work_3d=final_ew1,
            final_iw1_work_3d=final_iw1, unavailable_3d=unavailable_3d,
            staffno_1d=staffno_1d, staffname_1d=staffname_1d,
            day_week_2d=day_week_2d, file_path=output,
        )
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="shift_schedule_result.xlsx"'},
        )
    except HTTPException:
        raise
    except (BadZipFile, InvalidFileException, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Excelファイルの形式または内容が正しくありません: {exc}",
        ) from exc
    finally:
        await file.close()
