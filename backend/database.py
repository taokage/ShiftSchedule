from __future__ import annotations

from datetime import date, datetime, timezone
import re
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    inspect,
    select,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class StaffProfile(Base):
    __tablename__ = "staff_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    staff_code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    emergency_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    leader_level: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ew1_available: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ew2_available: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ew3_available: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    iw1_available: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    iw2_available: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    target_day: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    target_night: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    outside_work: Mapped[list[RegularOutsideWork]] = relationship(
        back_populates="staff_profile", cascade="all, delete-orphan", order_by="RegularOutsideWork.weekday"
    )


class RegularOutsideWork(Base):
    __tablename__ = "regular_outside_work"
    __table_args__ = (UniqueConstraint("staff_code", "weekday", name="uq_regular_outside_staff_code_weekday"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    staff_code: Mapped[str] = mapped_column(
        String(30),
        ForeignKey("staff_profiles.staff_code", ondelete="CASCADE", onupdate="CASCADE"),
        nullable=False,
        index=True,
    )
    weekday: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0=月 ... 6=日
    hospital_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")

    staff_profile: Mapped[StaffProfile] = relationship(back_populates="outside_work")


class Cycle(Base):
    __tablename__ = "cycles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    start_date: Mapped[date] = mapped_column(Date, unique=True, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="editing")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)


class RequestCycleStaff(Base):
    __tablename__ = "request_cycle_staff"
    __table_args__ = (UniqueConstraint("cycle_id", "slot_index", name="uq_request_cycle_staff_slot"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("cycles.id", ondelete="CASCADE"), nullable=False, index=True)
    slot_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    staff_profile_id: Mapped[int | None] = mapped_column(ForeignKey("staff_profiles.id", ondelete="SET NULL"), nullable=True)
    staff_code: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    name: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    emergency_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    leader_level: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ew1_available: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ew2_available: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ew3_available: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    iw1_available: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    iw2_available: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    target_day: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    target_night: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)


class FinalCycleStaff(Base):
    __tablename__ = "final_cycle_staff"
    __table_args__ = (UniqueConstraint("cycle_id", "slot_index", name="uq_final_cycle_staff_slot"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("cycles.id", ondelete="CASCADE"), nullable=False, index=True)
    slot_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    staff_profile_id: Mapped[int | None] = mapped_column(ForeignKey("staff_profiles.id", ondelete="SET NULL"), nullable=True)
    staff_code: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    name: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    emergency_count: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    leader_level: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ew1_available: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ew2_available: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ew3_available: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    iw1_available: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    iw2_available: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    target_day: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    target_night: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)


class ShiftRequest(Base):
    __tablename__ = "shift_requests"
    __table_args__ = (
        UniqueConstraint("cycle_id", "slot_index", "work_date", "shift", "stage", name="uq_shift_request"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("cycles.id", ondelete="CASCADE"), nullable=False, index=True)
    slot_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    shift: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0=日勤,1=夜勤
    stage: Mapped[str] = mapped_column(String(20), nullable=False)  # request / admin
    request_type: Mapped[str] = mapped_column(String(40), nullable=False, default="unavailable")
    remark: Mapped[str] = mapped_column(Text, nullable=False, default="")


class FinalShiftDecision(Base):
    """管理者が最終確認した勤務区分。本人申請とは別テーブルで保持する。"""

    __tablename__ = "final_shift_decisions"
    __table_args__ = (
        UniqueConstraint("cycle_id", "slot_index", "work_date", "shift", name="uq_final_shift_decision"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("cycles.id", ondelete="CASCADE"), nullable=False, index=True)
    slot_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    work_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    shift: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    decision_type: Mapped[str] = mapped_column(String(40), nullable=False, default="unavailable")
    remark: Mapped[str] = mapped_column(Text, nullable=False, default="")


class RequestCoverage(Base):
    __tablename__ = "request_coverage"
    __table_args__ = (UniqueConstraint("cycle_id", "work_date", "shift", name="uq_request_coverage"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("cycles.id", ondelete="CASCADE"), nullable=False, index=True)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    shift: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    minimum: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    leaders: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ew1: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ew2: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ew3: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    iw1: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    iw2: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)


class FinalCoverage(Base):
    __tablename__ = "final_coverage"
    __table_args__ = (UniqueConstraint("cycle_id", "work_date", "shift", name="uq_final_coverage"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("cycles.id", ondelete="CASCADE"), nullable=False, index=True)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    shift: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    minimum: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    leaders: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ew1: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ew2: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ew3: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    iw1: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    iw2: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)


class NightPairNG(Base):
    __tablename__ = "night_pair_ng"
    __table_args__ = (UniqueConstraint("cycle_id", "slot_a", "slot_b", name="uq_night_pair_ng_staff_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(ForeignKey("cycles.id", ondelete="CASCADE"), nullable=False, index=True)
    # 夜勤ペアNGは申請画面のslotではなく勤務者ID(S***)に紐づける。
    # DB列名は既存互換のため slot_a/slot_b を維持し、値を勤務者ID文字列として保存する。
    staff_code_a: Mapped[str] = mapped_column("slot_a", String(30), nullable=False, default="")
    staff_code_b: Mapped[str] = mapped_column("slot_b", String(30), nullable=False, default="")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)


def delete_cycle(session: Session, cycle_start: str) -> bool:
    """指定クールを削除する。cycle配下のrequest/final/coverage/NGはCASCADEで削除される。"""
    try:
        start = date.fromisoformat(cycle_start)
    except ValueError as exc:
        raise ValueError("cycle_start は YYYY-MM-DD 形式で指定してください。") from exc

    row = session.scalar(select(Cycle).where(Cycle.start_date == start))
    if row is None:
        return False
    session.delete(row)
    session.flush()
    return True


STAFF_FIELDS = (
    "emergency_count", "leader_level", "ew1_available", "ew2_available", "ew3_available",
    "iw1_available", "iw2_available", "target_day", "target_night",
)


def profile_to_dict(row: StaffProfile) -> dict[str, Any]:
    return {
        "id": row.id,
        "staff_code": row.staff_code,
        "name": row.name,
        **{field: int(getattr(row, field)) for field in STAFF_FIELDS},
        "active": bool(row.active),
        "outside_work": [
            {"id": item.id, "weekday": int(item.weekday), "hospital_name": item.hospital_name}
            for item in row.outside_work
        ],
    }


def list_profiles(session: Session) -> list[dict[str, Any]]:
    rows = session.scalars(select(StaffProfile).order_by(StaffProfile.staff_code, StaffProfile.id)).unique().all()
    return [profile_to_dict(row) for row in rows]


def replace_profiles(session: Session, payload: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen_ids: set[int] = set()
    seen_codes: set[str] = set()
    for index, item in enumerate(payload):
        profile_id = item.get("id")
        raw_code = str(item.get("staff_code") or "").strip().upper()
        raw_name = str(item.get("name") or "").strip()

        # 未設定の空欄行はDBへ保存しない。勤務者IDも自動採番しない。
        if not profile_id and not raw_code and not raw_name:
            continue
        if not raw_code:
            raise ValueError("勤務者IDが空欄です。勤務者を登録する場合は勤務者IDを入力してください。")

        code = raw_code
        if code in seen_codes:
            raise ValueError(f"勤務者ID {code} が重複しています。")
        seen_codes.add(code)
        row = session.get(StaffProfile, int(profile_id)) if profile_id else None
        duplicate = session.scalar(select(StaffProfile).where(StaffProfile.staff_code == code))
        if duplicate is not None and (row is None or duplicate.id != row.id):
            raise ValueError(f"勤務者ID {code} は既に使用されています。別の勤務者IDを指定してください。")
        if row is None:
            row = StaffProfile(staff_code=code)
            session.add(row)
            session.flush()
        seen_ids.add(row.id)
        row.staff_code = code
        row.name = str(item.get("name") or "").strip()
        row.emergency_count = max(0, min(1, int(item.get("emergency_count") or 0)))
        row.leader_level = max(0, min(2, int(item.get("leader_level") or 0)))
        row.ew1_available = max(0, min(1, int(item.get("ew1_available") or 0)))
        row.ew2_available = max(0, min(1, int(item.get("ew2_available") or 0)))
        row.ew3_available = max(0, min(1, int(item.get("ew3_available") or 0)))
        row.iw1_available = max(0, min(3, int(item.get("iw1_available") or 0)))
        row.iw2_available = max(0, min(1, int(item.get("iw2_available") or 0)))
        row.target_day = max(0, min(20, int(item.get("target_day") or 0)))
        row.target_night = max(0, min(10, int(item.get("target_night") or 0)))
        row.active = bool(item.get("active", True))

        # 既存の通常外勤を先にDELETEしてDBへflushする。
        # 同じ(staff_code, weekday)をそのまま再登録する場合、DELETEとINSERTを
        # 同一flushに任せるとUniqueConstraintに先にINSERTが当たり得るため、
        # ここで削除を確定してから新しい行を追加する。
        row.outside_work.clear()
        session.flush()

        outside_weekdays: set[int] = set()
        for rule in item.get("outside_work") or []:
            weekday = int(rule.get("weekday", -1))
            hospital = str(rule.get("hospital_name") or "").strip()
            if 0 <= weekday <= 6:
                if weekday in outside_weekdays:
                    raise ValueError(f"{row.name or row.staff_code} の通常外勤曜日が重複しています。")
                outside_weekdays.add(weekday)
                row.outside_work.append(RegularOutsideWork(staff_code=row.staff_code, weekday=weekday, hospital_name=hospital))
    session.flush()
    return list_profiles(session)



def delete_profile(session: Session, profile_id: int) -> bool:
    row = session.get(StaffProfile, int(profile_id))
    if row is None:
        return False
    session.delete(row)
    session.flush()
    return True

def _empty_staff(slot: int) -> dict[str, Any]:
    return {
        "no": slot,
        "profile_id": None,
        "staff_code": "",
        "name": "",
        "emergency_count": 0,
        "leader_level": 0,
        "ew1_available": 0,
        "ew2_available": 0,
        "ew3_available": 0,
        "iw1_available": 0,
        "iw2_available": 0,
        "target_day": 0,
        "target_night": 0,
    }


def load_cycle(session: Session, cycle_start: str, n_staff: int = 30, n_days: int = 31) -> dict[str, Any] | None:
    start = date.fromisoformat(cycle_start)
    cycle = session.scalar(select(Cycle).where(Cycle.start_date == start))
    if cycle is None:
        return None

    staff = [_empty_staff(i) for i in range(n_staff)]
    staff_rows = session.scalars(select(RequestCycleStaff).where(RequestCycleStaff.cycle_id == cycle.id)).all()
    for row in staff_rows:
        if 0 <= row.slot_index < n_staff:
            staff[row.slot_index] = {
                "no": row.slot_index,
                "profile_id": row.staff_profile_id,
                "staff_code": row.staff_code,
                "name": row.name,
                **{field: int(getattr(row, field)) for field in STAFF_FIELDS},
            }

    request_staff_names = [s["name"] for s in staff]

    final_staff = [_empty_staff(i) for i in range(n_staff)]
    final_staff_rows = session.scalars(select(FinalCycleStaff).where(FinalCycleStaff.cycle_id == cycle.id)).all()
    if final_staff_rows:
        for row in final_staff_rows:
            if 0 <= row.slot_index < n_staff:
                final_staff[row.slot_index] = {
                    "no": row.slot_index,
                    "profile_id": row.staff_profile_id,
                    "staff_code": row.staff_code,
                    "name": row.name,
                    **{field: int(getattr(row, field)) for field in STAFF_FIELDS},
                }
    else:
        final_staff = [dict(item) for item in staff]

    dates = []
    # The UI cycle start is the first application day; display includes 2 days before and 1 after.
    display_start = start.fromordinal(start.toordinal() - 2)
    for i in range(n_days):
        dates.append(display_start.fromordinal(display_start.toordinal() + i).isoformat())

    requests = [[['unavailable', 'unavailable'] for _ in range(n_days)] for _ in range(n_staff)]
    remarks = [[['', ''] for _ in range(n_days)] for _ in range(n_staff)]
    admin_requests = [[['unavailable', 'unavailable'] for _ in range(n_days)] for _ in range(n_staff)]
    admin_remarks = [[['', ''] for _ in range(n_days)] for _ in range(n_staff)]
    date_index = {raw: i for i, raw in enumerate(dates)}

    req_rows = session.scalars(
        select(ShiftRequest).where(ShiftRequest.cycle_id == cycle.id, ShiftRequest.stage == "request")
    ).all()
    for row in req_rows:
        d = date_index.get(row.work_date.isoformat())
        if d is None or not (0 <= row.slot_index < n_staff and 0 <= row.shift <= 1):
            continue
        requests[row.slot_index][d][row.shift] = row.request_type
        remarks[row.slot_index][d][row.shift] = row.remark or ""

    final_rows = session.scalars(
        select(FinalShiftDecision).where(FinalShiftDecision.cycle_id == cycle.id)
    ).all()
    for row in final_rows:
        d = date_index.get(row.work_date.isoformat())
        if d is None or not (0 <= row.slot_index < n_staff and 0 <= row.shift <= 1):
            continue
        admin_requests[row.slot_index][d][row.shift] = row.decision_type
        admin_remarks[row.slot_index][d][row.shift] = row.remark or ""

    if not final_rows:
        legacy_admin_rows = session.scalars(
            select(ShiftRequest).where(ShiftRequest.cycle_id == cycle.id, ShiftRequest.stage == "admin")
        ).all()
        for row in legacy_admin_rows:
            d = date_index.get(row.work_date.isoformat())
            if d is None or not (0 <= row.slot_index < n_staff and 0 <= row.shift <= 1):
                continue
            admin_requests[row.slot_index][d][row.shift] = row.request_type
            admin_remarks[row.slot_index][d][row.shift] = row.remark or ""

    coverage = [[
        {"minimum": 3, "leaders": 1, "ew1": 0, "ew2": 0, "ew3": 0, "iw1": 0, "iw2": 0},
        {"minimum": 2, "leaders": 1, "ew1": 0, "ew2": 0, "ew3": 0, "iw1": 0, "iw2": 0},
    ] for _ in range(n_days)]
    cov_rows = session.scalars(select(RequestCoverage).where(RequestCoverage.cycle_id == cycle.id)).all()
    for row in cov_rows:
        d = date_index.get(row.work_date.isoformat())
        if d is None or row.shift not in (0, 1):
            continue
        coverage[d][row.shift] = {
            "minimum": row.minimum, "leaders": row.leaders, "ew1": row.ew1, "ew2": row.ew2,
            "ew3": row.ew3, "iw1": row.iw1, "iw2": row.iw2,
        }

    final_coverage = [[dict(cell) for cell in day] for day in coverage]
    final_cov_rows = session.scalars(select(FinalCoverage).where(FinalCoverage.cycle_id == cycle.id)).all()
    if final_cov_rows:
        final_coverage = [[
            {"minimum": 3, "leaders": 1, "ew1": 0, "ew2": 0, "ew3": 0, "iw1": 0, "iw2": 0},
            {"minimum": 2, "leaders": 1, "ew1": 0, "ew2": 0, "ew3": 0, "iw1": 0, "iw2": 0},
        ] for _ in range(n_days)]
        for row in final_cov_rows:
            d = date_index.get(row.work_date.isoformat())
            if d is None or row.shift not in (0, 1):
                continue
            final_coverage[d][row.shift] = {
                "minimum": row.minimum, "leaders": row.leaders, "ew1": row.ew1, "ew2": row.ew2,
                "ew3": row.ew3, "iw1": row.iw1, "iw2": row.iw2,
            }

    pairs = session.scalars(select(NightPairNG).where(NightPairNG.cycle_id == cycle.id)).all()
    return {
        "start": dates[0],
        "cycleStart": cycle.start_date.isoformat(),
        "dates": dates,
        "staff": staff,
        "finalStaff": final_staff,
        "requestStaffNames": request_staff_names,
        "requests": requests,
        "remarks": remarks,
        "adminRequests": admin_requests,
        "adminRemarks": admin_remarks,
        "coverage": coverage,
        "finalCoverage": final_coverage,
        "night_pair_ng": [[p.staff_code_a, p.staff_code_b] for p in pairs if p.staff_code_a and p.staff_code_b],
        "status": cycle.status,
        "completedAt": cycle.completed_at.isoformat() if cycle.completed_at else None,
    }


def save_cycle(session: Session, cycle_start: str, payload: dict[str, Any], n_staff: int = 30, n_days: int = 31) -> dict[str, Any]:
    start = date.fromisoformat(cycle_start)
    cycle = session.scalar(select(Cycle).where(Cycle.start_date == start))
    if cycle is None:
        cycle = Cycle(start_date=start)
        session.add(cycle)
        session.flush()
    cycle.status = "completed" if payload.get("status") == "completed" else "editing"
    completed = payload.get("completedAt")
    if cycle.status == "completed" and completed:
        try:
            cycle.completed_at = datetime.fromisoformat(str(completed).replace("Z", "+00:00"))
        except ValueError:
            cycle.completed_at = datetime.now(timezone.utc)
    else:
        cycle.completed_at = None
    cycle.updated_at = datetime.now(timezone.utc)

    session.query(RequestCycleStaff).filter(RequestCycleStaff.cycle_id == cycle.id).delete(synchronize_session=False)
    session.query(FinalCycleStaff).filter(FinalCycleStaff.cycle_id == cycle.id).delete(synchronize_session=False)
    session.query(ShiftRequest).filter(ShiftRequest.cycle_id == cycle.id).delete(synchronize_session=False)
    session.query(FinalShiftDecision).filter(FinalShiftDecision.cycle_id == cycle.id).delete(synchronize_session=False)
    session.query(RequestCoverage).filter(RequestCoverage.cycle_id == cycle.id).delete(synchronize_session=False)
    session.query(FinalCoverage).filter(FinalCoverage.cycle_id == cycle.id).delete(synchronize_session=False)
    session.query(NightPairNG).filter(NightPairNG.cycle_id == cycle.id).delete(synchronize_session=False)

    staff = payload.get("staff") or []
    for slot in range(n_staff):
        item = staff[slot] if slot < len(staff) else {}
        profile_id = item.get("profile_id")
        session.add(RequestCycleStaff(
            cycle_id=cycle.id,
            slot_index=slot,
            staff_profile_id=int(profile_id) if profile_id else None,
            staff_code=str(item.get("staff_code") or ""),
            name=str(item.get("name") or ""),
            emergency_count=max(0, min(1, int(item.get("emergency_count") or 0))),
            leader_level=max(0, min(2, int(item.get("leader_level") or 0))),
            ew1_available=max(0, min(1, int(item.get("ew1_available") or 0))),
            ew2_available=max(0, min(1, int(item.get("ew2_available") or 0))),
            ew3_available=max(0, min(1, int(item.get("ew3_available") or 0))),
            iw1_available=max(0, min(3, int(item.get("iw1_available") or 0))),
            iw2_available=max(0, min(1, int(item.get("iw2_available") or 0))),
            target_day=max(0, min(20, int(item.get("target_day") or 0))),
            target_night=max(0, min(10, int(item.get("target_night") or 0))),
        ))

    final_staff = payload.get("finalStaff") or staff
    for slot in range(n_staff):
        item = final_staff[slot] if slot < len(final_staff) else {}
        profile_id = item.get("profile_id")
        session.add(FinalCycleStaff(
            cycle_id=cycle.id, slot_index=slot,
            staff_profile_id=int(profile_id) if profile_id else None,
            staff_code=str(item.get("staff_code") or ""), name=str(item.get("name") or ""),
            emergency_count=max(0, min(1, int(item.get("emergency_count") or 0))),
            leader_level=max(0, min(2, int(item.get("leader_level") or 0))),
            ew1_available=max(0, min(1, int(item.get("ew1_available") or 0))),
            ew2_available=max(0, min(1, int(item.get("ew2_available") or 0))),
            ew3_available=max(0, min(1, int(item.get("ew3_available") or 0))),
            iw1_available=max(0, min(3, int(item.get("iw1_available") or 0))),
            iw2_available=max(0, min(1, int(item.get("iw2_available") or 0))),
            target_day=max(0, min(20, int(item.get("target_day") or 0))),
            target_night=max(0, min(10, int(item.get("target_night") or 0))),
        ))

    dates = payload.get("dates") or []
    request_matrix = payload.get("requests") or []
    request_remarks = payload.get("remarks") or []
    for slot in range(min(n_staff, len(request_matrix))):
        for d in range(min(n_days, len(request_matrix[slot]), len(dates))):
            work_date = date.fromisoformat(dates[d])
            for shift in (0, 1):
                request_type = str(request_matrix[slot][d][shift] if shift < len(request_matrix[slot][d]) else "unavailable")
                remark = ""
                if slot < len(request_remarks) and d < len(request_remarks[slot]) and shift < len(request_remarks[slot][d]):
                    remark = str(request_remarks[slot][d][shift] or "")
                session.add(ShiftRequest(
                    cycle_id=cycle.id, slot_index=slot, work_date=work_date, shift=shift,
                    stage="request", request_type=request_type, remark=remark,
                ))

    final_matrix = payload.get("adminRequests") or payload.get("requests") or []
    final_remarks = payload.get("adminRemarks") or payload.get("remarks") or []
    for slot in range(min(n_staff, len(final_matrix))):
        for d in range(min(n_days, len(final_matrix[slot]), len(dates))):
            work_date = date.fromisoformat(dates[d])
            for shift in (0, 1):
                decision_type = str(final_matrix[slot][d][shift] if shift < len(final_matrix[slot][d]) else "unavailable")
                remark = ""
                if slot < len(final_remarks) and d < len(final_remarks[slot]) and shift < len(final_remarks[slot][d]):
                    remark = str(final_remarks[slot][d][shift] or "")
                session.add(FinalShiftDecision(
                    cycle_id=cycle.id, slot_index=slot, work_date=work_date, shift=shift,
                    decision_type=decision_type, remark=remark,
                ))

    cov = payload.get("coverage") or []
    for d in range(min(n_days, len(cov), len(dates))):
        for shift in (0, 1):
            item = cov[d][shift] if shift < len(cov[d]) else {}
            session.add(RequestCoverage(
                cycle_id=cycle.id, work_date=date.fromisoformat(dates[d]), shift=shift,
                minimum=max(0, int(item.get("minimum", 0))), leaders=max(0, int(item.get("leaders", 0))),
                ew1=max(0, int(item.get("ew1", 0))), ew2=max(0, int(item.get("ew2", 0))),
                ew3=max(0, int(item.get("ew3", 0))), iw1=max(0, int(item.get("iw1", 0))), iw2=max(0, int(item.get("iw2", 0))),
            ))

    final_cov = payload.get("finalCoverage") or cov
    for d in range(min(n_days, len(final_cov), len(dates))):
        for shift in (0, 1):
            item = final_cov[d][shift] if shift < len(final_cov[d]) else {}
            session.add(FinalCoverage(
                cycle_id=cycle.id, work_date=date.fromisoformat(dates[d]), shift=shift,
                minimum=max(0, int(item.get("minimum", 0))), leaders=max(0, int(item.get("leaders", 0))),
                ew1=max(0, int(item.get("ew1", 0))), ew2=max(0, int(item.get("ew2", 0))),
                ew3=max(0, int(item.get("ew3", 0))), iw1=max(0, int(item.get("iw1", 0))), iw2=max(0, int(item.get("iw2", 0))),
            ))

    for pair in payload.get("night_pair_ng") or []:
        if len(pair) == 2:
            a, b = sorted((str(pair[0] or "").strip(), str(pair[1] or "").strip()))
            if a and b and a != b:
                session.add(NightPairNG(cycle_id=cycle.id, staff_code_a=a, staff_code_b=b))

    session.flush()
    return load_cycle(session, cycle_start, n_staff, n_days) or {}


def cycle_statuses(session: Session) -> dict[str, str]:
    rows = session.execute(select(Cycle.start_date, Cycle.status)).all()
    return {row.start_date.isoformat(): row.status for row in rows}


def get_setting(session: Session, key: str) -> str | None:
    row = session.get(AppSetting, key)
    return row.value_text if row else None


def put_setting(session: Session, key: str, value: str) -> None:
    row = session.get(AppSetting, key)
    if row is None:
        row = AppSetting(key=key, value_text=value)
        session.add(row)
    else:
        row.value_text = value
        row.updated_at = datetime.now(timezone.utc)


def upgrade_app_settings_schema(engine) -> None:
    """app_settings.value_text を長いJSON設定も保存できるTEXTへ安全に拡張する。"""
    inspector = inspect(engine)
    if "app_settings" not in inspector.get_table_names():
        return
    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE app_settings ALTER COLUMN value_text TYPE TEXT"))


def upgrade_relational_schema(engine) -> None:
    """既存DBを破棄せず、regular_outside_work を staff_code 参照へ移行する。"""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "regular_outside_work" not in tables:
        return
    columns = {c["name"] for c in inspector.get_columns("regular_outside_work")}
    if "staff_code" in columns and "staff_profile_id" not in columns:
        return

    with engine.begin() as conn:
        if "staff_code" not in columns:
            conn.execute(text("ALTER TABLE regular_outside_work ADD COLUMN staff_code VARCHAR(30)"))
        if "staff_profile_id" in columns:
            conn.execute(text(
                "UPDATE regular_outside_work r SET staff_code = s.staff_code "
                "FROM staff_profiles s WHERE r.staff_profile_id = s.id AND r.staff_code IS NULL"
            ))
        missing = conn.execute(text(
            "SELECT COUNT(*) FROM regular_outside_work WHERE staff_code IS NULL OR staff_code = ''"
        )).scalar_one()
        if missing:
            raise RuntimeError("regular_outside_work の勤務者IDへ移行できない行があります。")
        conn.execute(text("""
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'regular_outside_work'
      AND c.contype IN ('f','u')
  LOOP
    EXECUTE format('ALTER TABLE regular_outside_work DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;
"""))
        conn.execute(text("ALTER TABLE regular_outside_work ALTER COLUMN staff_code SET NOT NULL"))
        if "staff_profile_id" in columns:
            conn.execute(text("ALTER TABLE regular_outside_work DROP COLUMN staff_profile_id"))
        conn.execute(text(
            "ALTER TABLE regular_outside_work ADD CONSTRAINT fk_regular_outside_staff_code "
            "FOREIGN KEY (staff_code) REFERENCES staff_profiles(staff_code) ON UPDATE CASCADE ON DELETE CASCADE"
        ))
        conn.execute(text(
            "ALTER TABLE regular_outside_work ADD CONSTRAINT uq_regular_outside_staff_code_weekday "
            "UNIQUE (staff_code, weekday)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_regular_outside_work_staff_code ON regular_outside_work(staff_code)"
        ))



def migrate_night_pair_ng_to_staff_code(engine) -> None:
    """旧slot番号形式のnight_pair_ngを、同じ列に勤務者ID(S***)を保存する形式へ移行する。"""
    inspector = inspect(engine)
    if "night_pair_ng" not in inspector.get_table_names():
        return
    cols = {c["name"]: c for c in inspector.get_columns("night_pair_ng")}
    if "slot_a" not in cols or "slot_b" not in cols:
        return
    dialect = engine.dialect.name
    with engine.begin() as conn:
        if dialect == "postgresql":
            # SmallInteger -> VARCHAR。既存番号は一旦文字列化してから勤務者IDへ置換する。
            conn.execute(text("ALTER TABLE night_pair_ng ALTER COLUMN slot_a TYPE VARCHAR(30) USING slot_a::text"))
            conn.execute(text("ALTER TABLE night_pair_ng ALTER COLUMN slot_b TYPE VARCHAR(30) USING slot_b::text"))
            conn.execute(text("""
                UPDATE night_pair_ng n
                SET slot_a = r.staff_code
                FROM request_cycle_staff r
                WHERE r.cycle_id = n.cycle_id
                  AND r.slot_index::text = n.slot_a
                  AND n.slot_a ~ '^[0-9]+$'
            """))
            conn.execute(text("""
                UPDATE night_pair_ng n
                SET slot_b = r.staff_code
                FROM request_cycle_staff r
                WHERE r.cycle_id = n.cycle_id
                  AND r.slot_index::text = n.slot_b
                  AND n.slot_b ~ '^[0-9]+$'
            """))
        elif dialect == "sqlite":
            # SQLiteは型が動的なので、旧数値を勤務者ID文字列へ置換するだけでよい。
            conn.execute(text("""
                UPDATE night_pair_ng
                SET slot_a = COALESCE((SELECT r.staff_code FROM request_cycle_staff r
                    WHERE r.cycle_id = night_pair_ng.cycle_id AND CAST(r.slot_index AS TEXT) = CAST(night_pair_ng.slot_a AS TEXT)), slot_a),
                    slot_b = COALESCE((SELECT r.staff_code FROM request_cycle_staff r
                    WHERE r.cycle_id = night_pair_ng.cycle_id AND CAST(r.slot_index AS TEXT) = CAST(night_pair_ng.slot_b AS TEXT)), slot_b)
            """))


def migrate_legacy_final_decisions(session: Session) -> int:
    """旧 shift_requests.stage='admin' を final_shift_decisions へ一度だけコピーする。"""
    if session.scalar(select(FinalShiftDecision.id).limit(1)) is not None:
        return 0
    legacy = session.scalars(select(ShiftRequest).where(ShiftRequest.stage == "admin")).all()
    for row in legacy:
        session.add(FinalShiftDecision(
            cycle_id=row.cycle_id,
            slot_index=row.slot_index,
            work_date=row.work_date,
            shift=row.shift,
            decision_type=row.request_type,
            remark=row.remark or "",
        ))
    session.flush()
    return len(legacy)


def migrate_legacy_app_state(engine, session_factory, n_staff: int = 30, n_days: int = 31) -> dict[str, int]:
    """One-time migration from legacy app_state JSON rows to normalized tables.

    The legacy table is read only. New application writes never use JSON/JSONB.
    """
    inspector = inspect(engine)
    if "app_state" not in inspector.get_table_names():
        return {"profiles": 0, "cycles": 0}

    with session_factory() as session:
        if session.scalar(select(Cycle.id).limit(1)) is not None:
            return {"profiles": 0, "cycles": 0}
        rows = session.execute(text("SELECT key, value, updated_at FROM app_state ORDER BY updated_at, key")).mappings().all()
        drafts: list[tuple[str, dict[str, Any]]] = []
        current_cycle = None
        latest_staff_by_name: dict[str, dict[str, Any]] = {}
        for row in rows:
            key = row["key"]
            value = row["value"]
            if not isinstance(value, dict):
                continue
            if key == "shift-current-cycle-v1":
                current_cycle = value.get("cycleStart")
                continue
            match = re.fullmatch(r"shift-draft-(\d{4}-\d{2}-\d{2})", key)
            if not match:
                continue
            start = match.group(1)
            drafts.append((start, value))
            for s in value.get("staff") or []:
                name = str(s.get("name") or "").strip()
                if name:
                    latest_staff_by_name[name] = s

        profile_by_name: dict[str, int] = {}
        for i, (name, s) in enumerate(latest_staff_by_name.items(), start=1):
            code = str(s.get("staff_code") or f"S{i:03d}")
            if session.scalar(select(StaffProfile).where(StaffProfile.staff_code == code)):
                code = f"S{i:03d}"
            row = StaffProfile(
                staff_code=code, name=name,
                emergency_count=max(0, min(1, int(s.get("emergency_count") or 0))),
                leader_level=max(0, min(2, int(s.get("leader_level") or 0))),
                ew1_available=max(0, min(1, int(s.get("ew1_available") or s.get("ew1_candidate") or 0))),
                ew2_available=max(0, min(1, int(s.get("ew2_available") or 0))),
                ew3_available=max(0, min(1, int(s.get("ew3_available") or 0))),
                iw1_available=max(0, min(3, int(s.get("iw1_available") or s.get("iw1_priority") or 0))),
                iw2_available=max(0, min(1, int(s.get("iw2_available") or 0))),
                target_day=max(0, min(20, int(s.get("target_day") or 0))),
                target_night=max(0, min(10, int(s.get("target_night") or 0))),
            )
            session.add(row)
            session.flush()
            profile_by_name[name] = row.id

        for start, value in drafts:
            staff = []
            for slot in range(n_staff):
                s = (value.get("staff") or [{}] * n_staff)[slot] if slot < len(value.get("staff") or []) else {}
                x = dict(s)
                x.pop("ew1_candidate", None)
                x.pop("iw1_priority", None)
                name = str(x.get("name") or "").strip()
                x["profile_id"] = profile_by_name.get(name)
                x["staff_code"] = x.get("staff_code") or (f"S{slot+1:03d}" if name else "")
                staff.append(x)
            migrated = dict(value)
            migrated["staff"] = staff
            migrated["cycleStart"] = start
            save_cycle(session, start, migrated, n_staff, n_days)

        if current_cycle:
            put_setting(session, "current_cycle", str(current_cycle))
        session.commit()
        return {"profiles": len(profile_by_name), "cycles": len(drafts)}
