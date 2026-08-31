import numpy as np
from ortools.sat.python import cp_model

from shift_schedule_constraints import add_all_constraints
from shift_schedule_objective import set_objective


NUM_STAFF = 30
NUM_DAYS = 31
NUM_SHIFTS = 2


def create_work_model_3d(model, prefix="work"):
    work_model_3d = {}

    for staff in range(NUM_STAFF):
        for day in range(NUM_DAYS):
            for shift in range(NUM_SHIFTS):
                work_model_3d[staff, day, shift] = model.NewBoolVar(
                    f"{prefix}_s{staff}_d{day}_sh{shift}"
                )

    return work_model_3d


def solve_shift_schedule(
    unavailable_3d,
    avoid_3d,
    mandatory_3d,
    ew1_mandatory_3d,
    iw1_mandatory_3d,
    optimal_staff_2d,
    min_work_count_2d,
    min_leader_count_2d,
    ew1_count_2d,
    iw1_count_2d,
    staffno_1d,
    leader_level_1d,
    is_ew1_candidate_1d,
    iw1_priority_1d,
    night_pair_ng_2d,
):
    model = cp_model.CpModel()

    work_model_3d = create_work_model_3d(model, prefix="work")
    ew1_work_model_3d = create_work_model_3d(model, prefix="ew1_work")
    iw1_work_model_3d = create_work_model_3d(model, prefix="iw1_work")

    add_all_constraints(
        model=model,
        work_model_3d=work_model_3d,
        ew1_work_model_3d=ew1_work_model_3d,
        iw1_work_model_3d=iw1_work_model_3d,
        unavailable_3d=unavailable_3d,
        mandatory_3d=mandatory_3d,
        ew1_mandatory_3d=ew1_mandatory_3d,
        iw1_mandatory_3d=iw1_mandatory_3d,
        min_work_count_2d=min_work_count_2d,
        min_leader_count_2d=min_leader_count_2d,
        ew1_count_2d=ew1_count_2d,
        iw1_count_2d=iw1_count_2d,
        leader_level_1d=leader_level_1d,
        is_ew1_candidate_1d=is_ew1_candidate_1d,
        iw1_priority_1d=iw1_priority_1d,
    )

    set_objective(
        model=model,
        work_model_3d=work_model_3d,
        ew1_work_model_3d=ew1_work_model_3d,
        iw1_work_model_3d=iw1_work_model_3d,
        unavailable_3d=unavailable_3d,
        avoid_3d=avoid_3d,
        optimal_staff_2d=optimal_staff_2d,
        min_work_count_2d=min_work_count_2d,
        ew1_count_2d=ew1_count_2d,
        iw1_count_2d=iw1_count_2d,
        iw1_priority_1d=iw1_priority_1d,
        night_pair_ng_2d=night_pair_ng_2d,
        leader_level_1d=leader_level_1d,
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30
    solver.parameters.num_search_workers = 8

    status = solver.Solve(model)

    final_work_3d = np.zeros(
        (NUM_STAFF, NUM_DAYS, NUM_SHIFTS),
        dtype=bool,
    )

    final_ew1_work_3d = np.zeros(
        (NUM_STAFF, NUM_DAYS, NUM_SHIFTS),
        dtype=bool,
    )

    final_iw1_work_3d = np.zeros(
        (NUM_STAFF, NUM_DAYS, NUM_SHIFTS),
        dtype=bool,
    )

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for staff in range(NUM_STAFF):
            for day in range(NUM_DAYS):
                for shift in range(NUM_SHIFTS):
                    final_work_3d[staff, day, shift] = bool(
                        solver.Value(work_model_3d[staff, day, shift])
                    )

                    final_ew1_work_3d[staff, day, shift] = bool(
                        solver.Value(ew1_work_model_3d[staff, day, shift])
                    )

                    final_iw1_work_3d[staff, day, shift] = bool(
                        solver.Value(iw1_work_model_3d[staff, day, shift])
                    )

    return final_work_3d, final_ew1_work_3d, final_iw1_work_3d, status