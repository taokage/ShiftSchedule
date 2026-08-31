NUM_STAFF = 30
NUM_DAYS = 31
NUM_SHIFTS = 2

DAY_SHIFT = 0
NIGHT_SHIFT = 1


def add_unavailable_constraints(
    model,
    work_model_3d,
    ew1_work_model_3d,
    iw1_work_model_3d,
    unavailable_3d,
):
    """勤務不可は本務・ew1外勤・iw1内勤とも勤務させない"""
    for staff in range(NUM_STAFF):
        for day in range(NUM_DAYS):
            for shift in range(NUM_SHIFTS):
                if unavailable_3d[staff, day, shift]:
                    model.Add(work_model_3d[staff, day, shift] == 0)
                    model.Add(ew1_work_model_3d[staff, day, shift] == 0)
                    model.Add(iw1_work_model_3d[staff, day, shift] == 0)


def add_mandatory_constraints(model, work_model_3d, mandatory_3d):
    """本務の必ず勤務"""
    for staff in range(NUM_STAFF):
        for day in range(NUM_DAYS):
            for shift in range(NUM_SHIFTS):
                if mandatory_3d[staff, day, shift]:
                    model.Add(work_model_3d[staff, day, shift] == 1)


def add_ew1_mandatory_constraints(model, ew1_work_model_3d, ew1_mandatory_3d):
    """ew1外勤の必ず勤務"""
    for staff in range(NUM_STAFF):
        for day in range(NUM_DAYS):
            for shift in range(NUM_SHIFTS):
                if ew1_mandatory_3d[staff, day, shift]:
                    model.Add(ew1_work_model_3d[staff, day, shift] == 1)


def add_iw1_mandatory_constraints(model, iw1_work_model_3d, iw1_mandatory_3d):
    """iw1内勤の必ず勤務"""
    for staff in range(NUM_STAFF):
        for day in range(NUM_DAYS):
            for shift in range(NUM_SHIFTS):
                if iw1_mandatory_3d[staff, day, shift]:
                    model.Add(iw1_work_model_3d[staff, day, shift] == 1)


def add_min_staff_constraints(model, work_model_3d, min_work_count_2d):
    """本務の最低勤務人数"""
    for day in range(2, NUM_DAYS-1):
        for shift in range(NUM_SHIFTS):
            model.Add(
                sum(work_model_3d[staff, day, shift] for staff in range(NUM_STAFF))
                >= min_work_count_2d[day, shift]
            )


def add_min_leader_constraints(model, work_model_3d, min_leader_count_2d, leader_level_1d):
    """本務の最低リーダー人数：leader_level 1以上をリーダー扱い"""
    for day in range(2, NUM_DAYS - 1):
        for shift in range(NUM_SHIFTS):
            model.Add(
                sum(
                    work_model_3d[staff, day, shift] * int(leader_level_1d[staff] >= 1)
                    for staff in range(NUM_STAFF)
                )
                >= min_leader_count_2d[day, shift]
            )


def add_ew1_count_constraints(model, ew1_work_model_3d, ew1_count_2d):
    """ew1外勤の必要人数"""
    for day in range(2, NUM_DAYS-1):
        for shift in range(NUM_SHIFTS):
            model.Add(
                sum(ew1_work_model_3d[staff, day, shift] for staff in range(NUM_STAFF))
                >= ew1_count_2d[day, shift]
            )


def add_iw1_count_constraints(model, iw1_work_model_3d, iw1_count_2d):
    """iw1内勤の必要人数"""
    for day in range(2, NUM_DAYS-1):
        for shift in range(NUM_SHIFTS):
            model.Add(
                sum(iw1_work_model_3d[staff, day, shift] for staff in range(NUM_STAFF))
                >= iw1_count_2d[day, shift]
            )


def add_ew1_candidate_constraints(model, ew1_work_model_3d, is_ew1_candidate_1d):
    """ew1候補者以外はew1外勤に入れない"""
    for staff in range(NUM_STAFF):
        if not is_ew1_candidate_1d[staff]:
            for day in range(2, NUM_DAYS-1):
                for shift in range(NUM_SHIFTS):
                    model.Add(ew1_work_model_3d[staff, day, shift] == 0)

def add_iw1_priority_constraints(model, iw1_work_model_3d, iw1_priority_1d):
    """iw1_priority=0 のスタッフは iw1内勤に入れない"""
    for staff in range(NUM_STAFF):
        if iw1_priority_1d[staff] == 0:
            for day in range(2, NUM_DAYS-1):
                for shift in range(NUM_SHIFTS):
                    model.Add(iw1_work_model_3d[staff, day, shift] == 0)


def add_same_shift_conflict_constraints(
    model,
    work_model_3d,
    ew1_work_model_3d,
    iw1_work_model_3d,
):
    """同じ勤務帯で本務・ew1・iw1を重複させない"""
    for staff in range(NUM_STAFF):
        for day in range(NUM_DAYS):
            for shift in range(NUM_SHIFTS):
                model.Add(
                    work_model_3d[staff, day, shift]
                    + ew1_work_model_3d[staff, day, shift]
                    + iw1_work_model_3d[staff, day, shift]
                    <= 1
                )


def add_two_day_max_two_shifts_constraints(
    model,
    work_model_3d,
    ew1_work_model_3d,
    iw1_work_model_3d,
):
    """本務＋ew1＋iw1を含めて、2日間で最大2勤務まで"""
    for staff in range(NUM_STAFF):
        for day in range(1, NUM_DAYS - 1):
            model.Add(
                work_model_3d[staff, day, DAY_SHIFT]
                + work_model_3d[staff, day, NIGHT_SHIFT]
                + ew1_work_model_3d[staff, day, DAY_SHIFT]
                + ew1_work_model_3d[staff, day, NIGHT_SHIFT]
                + iw1_work_model_3d[staff, day, DAY_SHIFT]
                + iw1_work_model_3d[staff, day, NIGHT_SHIFT]
                + work_model_3d[staff, day + 1, DAY_SHIFT]
                + work_model_3d[staff, day + 1, NIGHT_SHIFT]
                + ew1_work_model_3d[staff, day + 1, DAY_SHIFT]
                + ew1_work_model_3d[staff, day + 1, NIGHT_SHIFT]
                + iw1_work_model_3d[staff, day + 1, DAY_SHIFT]
                + iw1_work_model_3d[staff, day + 1, NIGHT_SHIFT]
                <= 2
            )


def add_all_constraints(
    model,
    work_model_3d,
    ew1_work_model_3d,
    iw1_work_model_3d,
    unavailable_3d,
    mandatory_3d,
    ew1_mandatory_3d,
    iw1_mandatory_3d,
    min_work_count_2d,
    min_leader_count_2d,
    ew1_count_2d,
    iw1_count_2d,
    leader_level_1d,
    is_ew1_candidate_1d,
    iw1_priority_1d,
):
    add_unavailable_constraints(
        model,
        work_model_3d,
        ew1_work_model_3d,
        iw1_work_model_3d,
        unavailable_3d,
    )

    add_mandatory_constraints(
        model,
        work_model_3d,
        mandatory_3d,
    )

    add_ew1_mandatory_constraints(
        model,
        ew1_work_model_3d,
        ew1_mandatory_3d,
    )

    add_iw1_mandatory_constraints(
        model,
        iw1_work_model_3d,
        iw1_mandatory_3d,
    )

    add_min_staff_constraints(
        model,
        work_model_3d,
        min_work_count_2d,
    )

    add_min_leader_constraints(
        model,
        work_model_3d,
        min_leader_count_2d,
        leader_level_1d,
    )

    add_ew1_count_constraints(
        model,
        ew1_work_model_3d,
        ew1_count_2d,
    )

    add_iw1_count_constraints(
        model,
        iw1_work_model_3d,
        iw1_count_2d,
    )

    add_ew1_candidate_constraints(
        model,
        ew1_work_model_3d,
        is_ew1_candidate_1d,
    )

    add_iw1_priority_constraints(
        model,
        iw1_work_model_3d,
        iw1_priority_1d,
    )

    add_same_shift_conflict_constraints(
        model,
        work_model_3d,
        ew1_work_model_3d,
        iw1_work_model_3d,
    )

    add_two_day_max_two_shifts_constraints(
        model,
        work_model_3d,
        ew1_work_model_3d,
        iw1_work_model_3d,
    )