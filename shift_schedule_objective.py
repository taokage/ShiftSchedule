NUM_STAFF = 30
NUM_DAYS = 31
NUM_SHIFTS = 2

DAY_SHIFT = 0
NIGHT_SHIFT = 1


def set_objective(
    model,
    work_model_3d,
    ew1_work_model_3d,
    iw1_work_model_3d,
    unavailable_3d,
    avoid_3d,
    optimal_staff_2d,
    min_work_count_2d,
    ew1_count_2d,
    iw1_count_2d,
    iw1_priority_1d,
    night_pair_ng_2d,
    leader_level_1d,
):
    objective_terms = []

    # 目的1：回避希望を避ける
    # 勤務不可・回避希望が多いスタッフほど、
    # 回避希望日に勤務した場合のペナルティを軽くする

    BASE_AVOID_PENALTY = 300
    REQUEST_DISCOUNT_PER_COUNT = 10
    MIN_AVOID_PENALTY = 20

    for staff in range(NUM_STAFF):

        request_count = sum(
            int(unavailable_3d[staff, day, shift])
            + int(avoid_3d[staff, day, shift])
            for day in range(2, NUM_DAYS - 1)
            for shift in range(NUM_SHIFTS)
        )

        staff_avoid_penalty = max(
            MIN_AVOID_PENALTY,
            BASE_AVOID_PENALTY
            - REQUEST_DISCOUNT_PER_COUNT * request_count
        )

        for day in range(2, NUM_DAYS - 1):
            for shift in range(NUM_SHIFTS):

                if avoid_3d[staff, day, shift]:
                    objective_terms.append(
                        staff_avoid_penalty
                        * work_model_3d[staff, day, shift]
                    )

                    objective_terms.append(
                        staff_avoid_penalty
                        * ew1_work_model_3d[staff, day, shift]
                    )

                    objective_terms.append(
                        staff_avoid_penalty
                        * iw1_work_model_3d[staff, day, shift]
                    )

    # 目的2：本務＋IW1内勤勤務回数を optimal_staff_2d に近づける
    STAFF_COUNT_PENALTY_1 = 10
    STAFF_COUNT_PENALTY_2 = 100
    STAFF_COUNT_PENALTY_3 = 2000
    STAFF_COUNT_PENALTY_4_PLUS = 10000

    for staff in range(NUM_STAFF):
        for shift in range(NUM_SHIFTS):

            actual_count = sum(
                work_model_3d[staff, day, shift]
                + iw1_work_model_3d[staff, day, shift]
                for day in range(2, NUM_DAYS - 1)
            )

            target_count = int(optimal_staff_2d[staff, shift])

            diff_plus = model.NewIntVar(
                0,
                NUM_DAYS - 3,
                f"diff_plus_s{staff}_sh{shift}"
            )

            diff_minus = model.NewIntVar(
                0,
                NUM_DAYS - 3,
                f"diff_minus_s{staff}_sh{shift}"
            )

            model.Add(actual_count - target_count == diff_plus - diff_minus)

            penalty_multiplier = 2 if shift == NIGHT_SHIFT else 1

            for diff_var, diff_name in [
                (diff_plus, "plus"),
                (diff_minus, "minus"),
            ]:

                is_diff_1 = model.NewBoolVar(
                    f"is_diff_1_{diff_name}_s{staff}_sh{shift}"
                )
                is_diff_2 = model.NewBoolVar(
                    f"is_diff_2_{diff_name}_s{staff}_sh{shift}"
                )
                is_diff_3 = model.NewBoolVar(
                    f"is_diff_3_{diff_name}_s{staff}_sh{shift}"
                )

                diff_over_3 = model.NewIntVar(
                    0,
                    NUM_DAYS - 3,
                    f"diff_over_3_{diff_name}_s{staff}_sh{shift}"
                )

                model.Add(diff_var == 1).OnlyEnforceIf(is_diff_1)
                model.Add(diff_var != 1).OnlyEnforceIf(is_diff_1.Not())

                model.Add(diff_var == 2).OnlyEnforceIf(is_diff_2)
                model.Add(diff_var != 2).OnlyEnforceIf(is_diff_2.Not())

                model.Add(diff_var == 3).OnlyEnforceIf(is_diff_3)
                model.Add(diff_var != 3).OnlyEnforceIf(is_diff_3.Not())

                model.AddMaxEquality(
                    diff_over_3,
                    [
                        diff_var - 3,
                        0,
                    ]
                )

                objective_terms.append(
                    penalty_multiplier * STAFF_COUNT_PENALTY_1 * is_diff_1
                )
                objective_terms.append(
                    penalty_multiplier * STAFF_COUNT_PENALTY_2 * is_diff_2
                )
                objective_terms.append(
                    penalty_multiplier * STAFF_COUNT_PENALTY_3 * is_diff_3
                )
                objective_terms.append(
                    penalty_multiplier
                    * STAFF_COUNT_PENALTY_4_PLUS
                    * diff_over_3
                )

    # 目的3：本務の同日・日勤夜勤両方を避ける
    # ただし、勤務不可・回避希望が多い人はペナルティを軽くする

    BASE_DAY_NIGHT_SAME_DAY_PENALTY = 7200
    REQUEST_DISCOUNT_PER_COUNT = 120
    MIN_DAY_NIGHT_SAME_DAY_PENALTY = 1200

    for staff in range(NUM_STAFF):

        request_count = int(
            sum(
                int(unavailable_3d[staff, day, shift])
                + int(avoid_3d[staff, day, shift])
                for day in range(2, NUM_DAYS - 1)
                for shift in range(NUM_SHIFTS)
            )
        )

        staff_penalty = max(
            MIN_DAY_NIGHT_SAME_DAY_PENALTY,
            BASE_DAY_NIGHT_SAME_DAY_PENALTY
            - REQUEST_DISCOUNT_PER_COUNT * request_count
        )

        for day in range(2, NUM_DAYS - 1):
            both_day_night = model.NewBoolVar(
                f"both_day_night_s{staff}_d{day}"
            )

            day_night_sum = (
                    work_model_3d[staff, day, DAY_SHIFT]
                    + work_model_3d[staff, day, NIGHT_SHIFT]
            )

            model.Add(day_night_sum == 2).OnlyEnforceIf(both_day_night)
            model.Add(day_night_sum <= 1).OnlyEnforceIf(both_day_night.Not())

            objective_terms.append(
                staff_penalty * both_day_night
            )

    # 目的4：本務NightShift翌日の本務勤務を避ける
    POST_NIGHT_OFF_PENALTY = 10000

    for staff in range(NUM_STAFF):
        for day in range(1, NUM_DAYS - 1):

            post_night_violation = model.NewBoolVar(
                f"post_night_violation_s{staff}_d{day}"
            )

            next_day_work_sum = (
                work_model_3d[staff, day + 1, DAY_SHIFT]
                + work_model_3d[staff, day + 1, NIGHT_SHIFT]
            )

            model.Add(
                post_night_violation <= work_model_3d[staff, day, NIGHT_SHIFT]
            )

            model.Add(next_day_work_sum >= 1).OnlyEnforceIf(
                [work_model_3d[staff, day, NIGHT_SHIFT], post_night_violation]
            )

            model.Add(next_day_work_sum == 0).OnlyEnforceIf(
                [work_model_3d[staff, day, NIGHT_SHIFT], post_night_violation.Not()]
            )

            objective_terms.append(POST_NIGHT_OFF_PENALTY * post_night_violation)

    # 目的5：日勤＋夜勤×2 の本務＋IW1内勤負担を optimal_staff_2d に近づける
    WEIGHTED_WORK_COUNT_PENALTY_1 = 100
    WEIGHTED_WORK_COUNT_PENALTY_2 = 300
    WEIGHTED_WORK_COUNT_PENALTY_3_PLUS = 2000

    for staff in range(NUM_STAFF):
        actual_weighted_count = sum(
            (
                work_model_3d[staff, day, DAY_SHIFT]
                + iw1_work_model_3d[staff, day, DAY_SHIFT]
            ) * 1
            + (
                work_model_3d[staff, day, NIGHT_SHIFT]
                + iw1_work_model_3d[staff, day, NIGHT_SHIFT]
            ) * 2
            for day in range(2, NUM_DAYS - 1)
        )

        target_weighted_count = (
            int(optimal_staff_2d[staff, DAY_SHIFT]) * 1
            + int(optimal_staff_2d[staff, NIGHT_SHIFT]) * 2
        )

        weighted_diff_plus = model.NewIntVar(
            0,
            NUM_DAYS * 2,
            f"weighted_diff_plus_s{staff}"
        )

        weighted_diff_minus = model.NewIntVar(
            0,
            NUM_DAYS * 2,
            f"weighted_diff_minus_s{staff}"
        )

        weighted_abs_diff = model.NewIntVar(
            0,
            NUM_DAYS * 2,
            f"weighted_abs_diff_s{staff}"
        )

        weighted_over_2 = model.NewIntVar(
            0,
            NUM_DAYS * 2,
            f"weighted_over_2_s{staff}"
        )

        model.Add(
            actual_weighted_count - target_weighted_count
            == weighted_diff_plus - weighted_diff_minus
        )

        model.Add(
            weighted_abs_diff == weighted_diff_plus + weighted_diff_minus
        )

        diff_eq_1 = model.NewBoolVar(f"weighted_diff_eq_1_s{staff}")
        diff_eq_2 = model.NewBoolVar(f"weighted_diff_eq_2_s{staff}")

        model.Add(weighted_abs_diff == 1).OnlyEnforceIf(diff_eq_1)
        model.Add(weighted_abs_diff != 1).OnlyEnforceIf(diff_eq_1.Not())

        model.Add(weighted_abs_diff == 2).OnlyEnforceIf(diff_eq_2)
        model.Add(weighted_abs_diff != 2).OnlyEnforceIf(diff_eq_2.Not())

        model.AddMaxEquality(
            weighted_over_2,
            [
                weighted_abs_diff - 2,
                0,
            ]
        )

        objective_terms.append(
            WEIGHTED_WORK_COUNT_PENALTY_1 * diff_eq_1
        )

        objective_terms.append(
            WEIGHTED_WORK_COUNT_PENALTY_2 * diff_eq_2
        )

        objective_terms.append(
            WEIGHTED_WORK_COUNT_PENALTY_3_PLUS * weighted_over_2
        )

    # 目的6：本務日勤人数が min_work_count_2d を超えすぎない
    DAY_STAFF_EXCESS_PENALTY_1 = 10
    DAY_STAFF_EXCESS_PENALTY_2 = 30
    DAY_STAFF_EXCESS_PENALTY_3_PLUS = 1000

    for day in range(2, NUM_DAYS - 1):
        actual_day_staff_count = sum(
            work_model_3d[staff, day, DAY_SHIFT]
            for staff in range(NUM_STAFF)
        )

        target_day_staff_count = int(min_work_count_2d[day, DAY_SHIFT])

        excess_day_staff = model.NewIntVar(
            0,
            NUM_STAFF,
            f"excess_day_staff_d{day}"
        )

        excess_over_2 = model.NewIntVar(
            0,
            NUM_STAFF,
            f"excess_day_staff_over_2_d{day}"
        )

        model.AddMaxEquality(
            excess_day_staff,
            [
                actual_day_staff_count - target_day_staff_count,
                0,
            ]
        )

        excess_eq_1 = model.NewBoolVar(f"excess_day_staff_eq_1_d{day}")
        excess_eq_2 = model.NewBoolVar(f"excess_day_staff_eq_2_d{day}")

        model.Add(excess_day_staff == 1).OnlyEnforceIf(excess_eq_1)
        model.Add(excess_day_staff != 1).OnlyEnforceIf(excess_eq_1.Not())

        model.Add(excess_day_staff == 2).OnlyEnforceIf(excess_eq_2)
        model.Add(excess_day_staff != 2).OnlyEnforceIf(excess_eq_2.Not())

        model.AddMaxEquality(
            excess_over_2,
            [
                excess_day_staff - 2,
                0,
            ]
        )

        objective_terms.append(DAY_STAFF_EXCESS_PENALTY_1 * excess_eq_1)
        objective_terms.append(DAY_STAFF_EXCESS_PENALTY_2 * excess_eq_2)
        objective_terms.append(DAY_STAFF_EXCESS_PENALTY_3_PLUS * excess_over_2)

    # 目的7：本務夜勤人数が min_work_count_2d を超えすぎない
    # さらに、最高リーダーレベルが1で夜勤人数が2人以下の場合は強く避ける

    NIGHT_STAFF_EXCESS_PENALTY_0 = 40
    NIGHT_STAFF_EXCESS_PENALTY_1 = 0
    NIGHT_STAFF_EXCESS_PENALTY_2 = 1000
    NIGHT_STAFF_EXCESS_PENALTY_3_PLUS = 2000

    MAX_LEVEL1_AND_TWO_OR_LESS_PENALTY = 10000

    for day in range(2, NUM_DAYS - 1):
        actual_night_staff_count = sum(
            work_model_3d[staff, day, NIGHT_SHIFT]
            for staff in range(NUM_STAFF)
        )

        target_night_staff_count = int(min_work_count_2d[day, NIGHT_SHIFT])

        excess_night_staff = model.NewIntVar(
            0,
            NUM_STAFF,
            f"excess_night_staff_d{day}"
        )

        excess_over_2 = model.NewIntVar(
            0,
            NUM_STAFF,
            f"excess_night_staff_over_2_d{day}"
        )

        model.AddMaxEquality(
            excess_night_staff,
            [
                actual_night_staff_count - target_night_staff_count,
                0,
            ]
        )

        excess_eq_0 = model.NewBoolVar(f"excess_night_staff_eq_0_d{day}")
        excess_eq_1 = model.NewBoolVar(f"excess_night_staff_eq_1_d{day}")
        excess_eq_2 = model.NewBoolVar(f"excess_night_staff_eq_2_d{day}")

        model.Add(excess_night_staff == 0).OnlyEnforceIf(excess_eq_0)
        model.Add(excess_night_staff != 0).OnlyEnforceIf(excess_eq_0.Not())

        model.Add(excess_night_staff == 1).OnlyEnforceIf(excess_eq_1)
        model.Add(excess_night_staff != 1).OnlyEnforceIf(excess_eq_1.Not())

        model.Add(excess_night_staff == 2).OnlyEnforceIf(excess_eq_2)
        model.Add(excess_night_staff != 2).OnlyEnforceIf(excess_eq_2.Not())

        model.AddMaxEquality(
            excess_over_2,
            [
                excess_night_staff - 2,
                0,
            ]
        )

        # 夜勤内に level 1 リーダーがいるか
        level1_night_count = sum(
            work_model_3d[staff, day, NIGHT_SHIFT]
            for staff in range(NUM_STAFF)
            if int(leader_level_1d[staff]) == 1
        )

        has_level1 = model.NewBoolVar(f"has_level1_night_d{day}")
        model.Add(level1_night_count >= 1).OnlyEnforceIf(has_level1)
        model.Add(level1_night_count == 0).OnlyEnforceIf(has_level1.Not())

        # 夜勤内に level 2 リーダーがいるか
        level2_night_count = sum(
            work_model_3d[staff, day, NIGHT_SHIFT]
            for staff in range(NUM_STAFF)
            if int(leader_level_1d[staff]) == 2
        )

        has_level2 = model.NewBoolVar(f"has_level2_night_d{day}")
        model.Add(level2_night_count >= 1).OnlyEnforceIf(has_level2)
        model.Add(level2_night_count == 0).OnlyEnforceIf(has_level2.Not())

        # 最高リーダーレベルが1
        # ＝ level1 が1人以上いて、level2 がいない
        max_leader_level_is_1 = model.NewBoolVar(
            f"max_leader_level_is_1_d{day}"
        )

        model.AddBoolAnd(
            [has_level1, has_level2.Not()]
        ).OnlyEnforceIf(max_leader_level_is_1)

        model.AddBoolOr(
            [has_level1.Not(), has_level2]
        ).OnlyEnforceIf(max_leader_level_is_1.Not())

        # 夜勤人数が2人以下
        night_staff_count_is_2_or_less = model.NewBoolVar(
            f"night_staff_count_is_2_or_less_d{day}"
        )

        model.Add(actual_night_staff_count <= 2).OnlyEnforceIf(
            night_staff_count_is_2_or_less
        )
        model.Add(actual_night_staff_count >= 3).OnlyEnforceIf(
            night_staff_count_is_2_or_less.Not()
        )

        # 最高リーダーレベルが1 かつ 夜勤人数が2人以下
        max_level1_and_two_or_less = model.NewBoolVar(
            f"max_level1_and_two_or_less_d{day}"
        )

        model.AddBoolAnd(
            [
                max_leader_level_is_1,
                night_staff_count_is_2_or_less,
            ]
        ).OnlyEnforceIf(max_level1_and_two_or_less)

        model.AddBoolOr(
            [
                max_leader_level_is_1.Not(),
                night_staff_count_is_2_or_less.Not(),
            ]
        ).OnlyEnforceIf(max_level1_and_two_or_less.Not())

        objective_terms.append(NIGHT_STAFF_EXCESS_PENALTY_0 * excess_eq_0)
        objective_terms.append(NIGHT_STAFF_EXCESS_PENALTY_1 * excess_eq_1)
        objective_terms.append(NIGHT_STAFF_EXCESS_PENALTY_2 * excess_eq_2)
        objective_terms.append(NIGHT_STAFF_EXCESS_PENALTY_3_PLUS * excess_over_2)

        objective_terms.append(
            MAX_LEVEL1_AND_TWO_OR_LESS_PENALTY
            * max_level1_and_two_or_less
        )

    # 目的8：7日間ごとの本務＋IW1内勤勤務回数を
    # 日勤2回・夜勤1回に近づける
    WEEKLY_DAY_TARGET = 2
    WEEKLY_NIGHT_TARGET = 1

    WEEKLY_PENALTY_1 = 1
    WEEKLY_PENALTY_2 = 2
    WEEKLY_PENALTY_3 = 4
    WEEKLY_PENALTY_4 = 8

    for staff in range(NUM_STAFF):
        for week_start_day in range(2, NUM_DAYS - 1, 7):

            week_end_day = min(week_start_day + 7, NUM_DAYS - 1)

            for shift in range(NUM_SHIFTS):

                target_count = (
                    WEEKLY_DAY_TARGET
                    if shift == DAY_SHIFT
                    else WEEKLY_NIGHT_TARGET
                )

                actual_count = sum(
                    work_model_3d[staff, day, shift]
                    + iw1_work_model_3d[staff, day, shift]
                    for day in range(week_start_day, week_end_day)
                )

                diff_plus = model.NewIntVar(
                    0,
                    7,
                    f"weekly_diff_plus_s{staff}_d{week_start_day}_sh{shift}"
                )

                diff_minus = model.NewIntVar(
                    0,
                    7,
                    f"weekly_diff_minus_s{staff}_d{week_start_day}_sh{shift}"
                )

                abs_diff = model.NewIntVar(
                    0,
                    7,
                    f"weekly_abs_diff_s{staff}_d{week_start_day}_sh{shift}"
                )

                model.Add(actual_count - target_count == diff_plus - diff_minus)
                model.Add(abs_diff == diff_plus + diff_minus)

                diff_eq_1 = model.NewBoolVar(
                    f"weekly_diff_eq_1_s{staff}_d{week_start_day}_sh{shift}"
                )
                diff_eq_2 = model.NewBoolVar(
                    f"weekly_diff_eq_2_s{staff}_d{week_start_day}_sh{shift}"
                )
                diff_eq_3 = model.NewBoolVar(
                    f"weekly_diff_eq_3_s{staff}_d{week_start_day}_sh{shift}"
                )
                diff_ge_4 = model.NewBoolVar(
                    f"weekly_diff_ge_4_s{staff}_d{week_start_day}_sh{shift}"
                )

                model.Add(abs_diff == 1).OnlyEnforceIf(diff_eq_1)
                model.Add(abs_diff != 1).OnlyEnforceIf(diff_eq_1.Not())

                model.Add(abs_diff == 2).OnlyEnforceIf(diff_eq_2)
                model.Add(abs_diff != 2).OnlyEnforceIf(diff_eq_2.Not())

                model.Add(abs_diff == 3).OnlyEnforceIf(diff_eq_3)
                model.Add(abs_diff != 3).OnlyEnforceIf(diff_eq_3.Not())

                model.Add(abs_diff >= 4).OnlyEnforceIf(diff_ge_4)
                model.Add(abs_diff <= 3).OnlyEnforceIf(diff_ge_4.Not())

                objective_terms.append(WEEKLY_PENALTY_1 * diff_eq_1)
                objective_terms.append(WEEKLY_PENALTY_2 * diff_eq_2)
                objective_terms.append(WEEKLY_PENALTY_3 * diff_eq_3)
                objective_terms.append(WEEKLY_PENALTY_4 * diff_ge_4)

    # 目的9：ew1人数が ew1_count_2d を超えすぎない
    EW1_EXCESS_PENALTY_1 = 1000
    EW1_EXCESS_PENALTY_2 = 10000
    EW1_EXCESS_PENALTY_3_PLUS = 30000

    for day in range(NUM_DAYS):
        for shift in range(NUM_SHIFTS):
            actual_ew1_count = sum(
                ew1_work_model_3d[staff, day, shift]
                for staff in range(NUM_STAFF)
            )

            target_ew1_count = int(ew1_count_2d[day, shift])

            excess_ew1 = model.NewIntVar(
                0,
                NUM_STAFF,
                f"excess_ew1_d{day}_sh{shift}"
            )

            excess_ew1_over_2 = model.NewIntVar(
                0,
                NUM_STAFF,
                f"excess_ew1_over_2_d{day}_sh{shift}"
            )

            model.AddMaxEquality(
                excess_ew1,
                [
                    actual_ew1_count - target_ew1_count,
                    0,
                ]
            )

            excess_eq_1 = model.NewBoolVar(
                f"excess_ew1_eq_1_d{day}_sh{shift}"
            )
            excess_eq_2 = model.NewBoolVar(
                f"excess_ew1_eq_2_d{day}_sh{shift}"
            )

            model.Add(excess_ew1 == 1).OnlyEnforceIf(excess_eq_1)
            model.Add(excess_ew1 != 1).OnlyEnforceIf(excess_eq_1.Not())

            model.Add(excess_ew1 == 2).OnlyEnforceIf(excess_eq_2)
            model.Add(excess_ew1 != 2).OnlyEnforceIf(excess_eq_2.Not())

            model.AddMaxEquality(
                excess_ew1_over_2,
                [
                    excess_ew1 - 2,
                    0,
                ]
            )

            objective_terms.append(EW1_EXCESS_PENALTY_1 * excess_eq_1)
            objective_terms.append(EW1_EXCESS_PENALTY_2 * excess_eq_2)
            objective_terms.append(
                EW1_EXCESS_PENALTY_3_PLUS * excess_ew1_over_2
            )

    # =====================
    # 目的10：1スタッフあたりのEW1外勤回数を抑える
    # 勤務不可・回避希望が多いスタッフがEW1に入る場合は
    # 追加ペナルティを加える
    # =====================

    EW1_STAFF_PENALTY_2 = 200
    EW1_STAFF_PENALTY_3_PLUS = 1000

    EW1_REQUEST_BASE_PENALTY = 0
    EW1_REQUEST_PENALTY_PER_COUNT = 10
    EW1_REQUEST_MAX_PENALTY = 500

    for staff in range(NUM_STAFF):
        # 対象期間の勤務不可・回避希望の合計
        request_count = sum(
            int(unavailable_3d[staff, day, shift])
            + int(avoid_3d[staff, day, shift])
            for day in range(2, NUM_DAYS - 1)
            for shift in range(NUM_SHIFTS)
        )

        # 希望が多いスタッフほど、
        # EW1外勤1回あたりのペナルティを大きくする
        ew1_request_penalty = min(
            EW1_REQUEST_MAX_PENALTY,
            EW1_REQUEST_BASE_PENALTY
            + EW1_REQUEST_PENALTY_PER_COUNT * request_count
        )

        ew1_staff_count = sum(
            ew1_work_model_3d[staff, day, shift]
            for day in range(2, NUM_DAYS - 1)
            for shift in range(NUM_SHIFTS)
        )

        is_ew1_2 = model.NewBoolVar(
            f"is_ew1_2_s{staff}"
        )

        ew1_over_2 = model.NewIntVar(
            0,
            NUM_DAYS * NUM_SHIFTS,
            f"ew1_over_2_s{staff}"
        )

        model.Add(
            ew1_staff_count == 2
        ).OnlyEnforceIf(is_ew1_2)

        model.Add(
            ew1_staff_count != 2
        ).OnlyEnforceIf(is_ew1_2.Not())

        model.AddMaxEquality(
            ew1_over_2,
            [
                ew1_staff_count - 2,
                0,
            ]
        )

        # EW1が2回の場合
        objective_terms.append(
            EW1_STAFF_PENALTY_2 * is_ew1_2
        )

        # EW1が3回以上の場合
        objective_terms.append(
            EW1_STAFF_PENALTY_3_PLUS * ew1_over_2
        )

        # 勤務不可・回避希望数に応じた追加ペナルティ
        # EW1が1回入るごとに加算される
        objective_terms.append(
            ew1_request_penalty * ew1_staff_count
        )

    # =====================
    # 目的11：ew1外勤前後の勤務を避ける
    # =====================

    def add_conditional_penalty(trigger_var, target_vars, penalty, name):
        """
        trigger_var が True かつ target_vars のいずれかが True の場合に penalty を加える
        """

        target_any = model.NewBoolVar(f"{name}_target_any")
        violation = model.NewBoolVar(f"{name}_violation")

        model.Add(sum(target_vars) >= 1).OnlyEnforceIf(target_any)
        model.Add(sum(target_vars) == 0).OnlyEnforceIf(target_any.Not())

        model.AddBoolAnd([trigger_var, target_any]).OnlyEnforceIf(violation)
        model.AddBoolOr([trigger_var.Not(), target_any.Not()]).OnlyEnforceIf(
            violation.Not()
        )

        objective_terms.append(penalty * violation)

    for staff in range(NUM_STAFF):
        for day in range(2, NUM_DAYS - 1):

            # 外勤が日勤の場合
            ew1_day = ew1_work_model_3d[staff, day, DAY_SHIFT]

            add_conditional_penalty(
                trigger_var=ew1_day,
                target_vars=[
                    ew1_work_model_3d[staff, day - 1, NIGHT_SHIFT],
                    iw1_work_model_3d[staff, day - 1, NIGHT_SHIFT],
                    work_model_3d[staff, day - 1, NIGHT_SHIFT],
                ],
                penalty=30,
                name=f"ew1_day_prev_s{staff}_d{day}",
            )

            add_conditional_penalty(
                trigger_var=ew1_day,
                target_vars=[
                    ew1_work_model_3d[staff, day, NIGHT_SHIFT],
                    iw1_work_model_3d[staff, day, NIGHT_SHIFT],
                    work_model_3d[staff, day, NIGHT_SHIFT],
                ],
                penalty=100,
                name=f"ew1_day_same_s{staff}_d{day}",
            )

            # 外勤が夜勤の場合
            ew1_night = ew1_work_model_3d[staff, day, NIGHT_SHIFT]

            add_conditional_penalty(
                trigger_var=ew1_night,
                target_vars=[
                    ew1_work_model_3d[staff, day - 1, NIGHT_SHIFT],
                    iw1_work_model_3d[staff, day - 1, NIGHT_SHIFT],
                    work_model_3d[staff, day - 1, NIGHT_SHIFT],
                ],
                penalty=10,
                name=f"ew1_night_prev_s{staff}_d{day}",
            )

            add_conditional_penalty(
                trigger_var=ew1_night,
                target_vars=[
                    ew1_work_model_3d[staff, day, DAY_SHIFT],
                    iw1_work_model_3d[staff, day, DAY_SHIFT],
                    work_model_3d[staff, day, DAY_SHIFT],
                ],
                penalty=30,
                name=f"ew1_night_same_s{staff}_d{day}",
            )

            add_conditional_penalty(
                trigger_var=ew1_night,
                target_vars=[
                    ew1_work_model_3d[staff, day + 1, DAY_SHIFT],
                    iw1_work_model_3d[staff, day + 1, DAY_SHIFT],
                    work_model_3d[staff, day + 1, DAY_SHIFT],
                ],
                penalty=30,
                name=f"ew1_night_next_day_s{staff}_d{day}",
            )

            add_conditional_penalty(
                trigger_var=ew1_night,
                target_vars=[
                    ew1_work_model_3d[staff, day + 1, NIGHT_SHIFT],
                    iw1_work_model_3d[staff, day + 1, NIGHT_SHIFT],
                    work_model_3d[staff, day + 1, NIGHT_SHIFT],
                ],
                penalty=10,
                name=f"ew1_night_next_night_s{staff}_d{day}",
            )

    # =====================
    # 目的12：iw1人数が iw1_count_2d を満たす
    # ただし超過しすぎない
    # =====================

    IW1_EXCESS_PENALTY_1 = 10000
    IW1_EXCESS_PENALTY_2 = 30000
    IW1_EXCESS_PENALTY_3_PLUS = 40000

    for day in range(2, NUM_DAYS - 1):
        for shift in range(NUM_SHIFTS):

            actual_iw1_count = sum(
                iw1_work_model_3d[staff, day, shift]
                for staff in range(NUM_STAFF)
            )

            target_iw1_count = int(iw1_count_2d[day, shift])

            excess_iw1 = model.NewIntVar(
                0,
                NUM_STAFF,
                f"excess_iw1_d{day}_sh{shift}"
            )

            excess_iw1_over_2 = model.NewIntVar(
                0,
                NUM_STAFF,
                f"excess_iw1_over_2_d{day}_sh{shift}"
            )

            model.AddMaxEquality(
                excess_iw1,
                [
                    actual_iw1_count - target_iw1_count,
                    0,
                ]
            )

            excess_eq_1 = model.NewBoolVar(
                f"excess_iw1_eq_1_d{day}_sh{shift}"
            )
            excess_eq_2 = model.NewBoolVar(
                f"excess_iw1_eq_2_d{day}_sh{shift}"
            )

            model.Add(excess_iw1 == 1).OnlyEnforceIf(excess_eq_1)
            model.Add(excess_iw1 != 1).OnlyEnforceIf(excess_eq_1.Not())

            model.Add(excess_iw1 == 2).OnlyEnforceIf(excess_eq_2)
            model.Add(excess_iw1 != 2).OnlyEnforceIf(excess_eq_2.Not())

            model.AddMaxEquality(
                excess_iw1_over_2,
                [
                    excess_iw1 - 2,
                    0,
                ]
            )

            objective_terms.append(IW1_EXCESS_PENALTY_1 * excess_eq_1)
            objective_terms.append(IW1_EXCESS_PENALTY_2 * excess_eq_2)
            objective_terms.append(
                IW1_EXCESS_PENALTY_3_PLUS * excess_iw1_over_2
            )

    # =====================
    # 目的13：iw1_priority が高いスタッフを選ばれやすくする
    # =====================

    IW1_PRIORITY_REWARD = 10

    for staff in range(NUM_STAFF):

        priority = int(iw1_priority_1d[staff])

        # priority が高いほど目的関数が小さくなる
        iw1_priority_penalty = 100 - IW1_PRIORITY_REWARD * priority

        for day in range(NUM_DAYS):
            for shift in range(NUM_SHIFTS):

                objective_terms.append(
                    iw1_priority_penalty
                    * iw1_work_model_3d[staff, day, shift]
                )

    # =====================
    # 目的14：1スタッフあたりのiw1内勤回数制限
    # =====================

    IW1_STAFF_PENALTY_2 = 100
    IW1_STAFF_PENALTY_3_PLUS = 1000

    for staff in range(NUM_STAFF):

        iw1_staff_count = sum(
            iw1_work_model_3d[staff, day, shift]
            for day in range(2, NUM_DAYS - 1)
            for shift in range(NUM_SHIFTS)
        )

        is_iw1_2 = model.NewBoolVar(f"is_iw1_2_s{staff}")

        iw1_over_2 = model.NewIntVar(
            0,
            NUM_DAYS * NUM_SHIFTS,
            f"iw1_over_2_s{staff}"
        )

        model.Add(iw1_staff_count == 2).OnlyEnforceIf(is_iw1_2)
        model.Add(iw1_staff_count != 2).OnlyEnforceIf(is_iw1_2.Not())

        model.AddMaxEquality(
            iw1_over_2,
            [
                iw1_staff_count - 2,
                0,
            ]
        )

        objective_terms.append(IW1_STAFF_PENALTY_2 * is_iw1_2)
        objective_terms.append(IW1_STAFF_PENALTY_3_PLUS * iw1_over_2)

    # =====================
    # 目的15：iw1内勤前後の勤務を避ける
    # =====================

    for staff in range(NUM_STAFF):
        for day in range(2, NUM_DAYS - 1):

            # IW1内勤が日勤の場合
            iw1_day = iw1_work_model_3d[staff, day, DAY_SHIFT]

            add_conditional_penalty(
                trigger_var=iw1_day,
                target_vars=[
                    ew1_work_model_3d[staff, day - 1, NIGHT_SHIFT],
                    iw1_work_model_3d[staff, day - 1, NIGHT_SHIFT],
                    work_model_3d[staff, day - 1, NIGHT_SHIFT],
                ],
                penalty=1,
                name=f"iw1_day_prev_s{staff}_d{day}",
            )

            add_conditional_penalty(
                trigger_var=iw1_day,
                target_vars=[
                    ew1_work_model_3d[staff, day, NIGHT_SHIFT],
                    iw1_work_model_3d[staff, day, NIGHT_SHIFT],
                    work_model_3d[staff, day, NIGHT_SHIFT],
                ],
                penalty=100,
                name=f"iw1_day_same_s{staff}_d{day}",
            )

            # IW1内勤が夜勤の場合
            iw1_night = iw1_work_model_3d[staff, day, NIGHT_SHIFT]

            add_conditional_penalty(
                trigger_var=iw1_night,
                target_vars=[
                    ew1_work_model_3d[staff, day - 1, NIGHT_SHIFT],
                    iw1_work_model_3d[staff, day - 1, NIGHT_SHIFT],
                    work_model_3d[staff, day - 1, NIGHT_SHIFT],
                ],
                penalty=10,
                name=f"iw1_night_prev_s{staff}_d{day}",
            )

            add_conditional_penalty(
                trigger_var=iw1_night,
                target_vars=[
                    ew1_work_model_3d[staff, day, DAY_SHIFT],
                    iw1_work_model_3d[staff, day, DAY_SHIFT],
                    work_model_3d[staff, day, DAY_SHIFT],
                ],
                penalty=30,
                name=f"iw1_night_same_s{staff}_d{day}",
            )

            add_conditional_penalty(
                trigger_var=iw1_night,
                target_vars=[
                    ew1_work_model_3d[staff, day + 1, DAY_SHIFT],
                    iw1_work_model_3d[staff, day + 1, DAY_SHIFT],
                    work_model_3d[staff, day + 1, DAY_SHIFT],
                ],
                penalty=30,
                name=f"iw1_night_next_day_s{staff}_d{day}",
            )

            add_conditional_penalty(
                trigger_var=iw1_night,
                target_vars=[
                    ew1_work_model_3d[staff, day + 1, NIGHT_SHIFT],
                    iw1_work_model_3d[staff, day + 1, NIGHT_SHIFT],
                    work_model_3d[staff, day + 1, NIGHT_SHIFT],
                ],
                penalty=10,
                name=f"iw1_night_next_night_s{staff}_d{day}",
            )

    # =====================
    # 目的16：NGペアが同じ本務夜勤に入ることを避ける
    # =====================

    NIGHT_PAIR_NG_PENALTY = 10000

    for day in range(2, NUM_DAYS - 1):
        for staff1 in range(NUM_STAFF):
            for staff2 in range(staff1 + 1, NUM_STAFF):

                if not night_pair_ng_2d[staff1, staff2]:
                    continue

                night_pair_violation = model.NewBoolVar(
                    f"night_pair_ng_s{staff1}_s{staff2}_d{day}"
                )

                model.Add(
                    work_model_3d[staff1, day, NIGHT_SHIFT]
                    + work_model_3d[staff2, day, NIGHT_SHIFT]
                    == 2
                ).OnlyEnforceIf(night_pair_violation)

                model.Add(
                    work_model_3d[staff1, day, NIGHT_SHIFT]
                    + work_model_3d[staff2, day, NIGHT_SHIFT]
                    <= 1
                ).OnlyEnforceIf(night_pair_violation.Not())

                objective_terms.append(
                    NIGHT_PAIR_NG_PENALTY * night_pair_violation
                )

    # =====================
    # 目的17：IW1日勤を、本務日勤＋IW1日勤が多い人に優先して割り当てる
    #
    # 本務日勤＋IW1日勤回数が
    # 7回以下 → IW1日勤1回あたり penalty 130
    # 8回     → 120
    # 9回     → 110
    # ...
    # 20回    → 0
    # =====================

    IW1_DAY_COUNT_MAX = 20
    IW1_DAY_COUNT_MIN_CAP = 7
    IW1_DAY_ASSIGN_PENALTY_UNIT = 10

    for staff in range(NUM_STAFF):

        total_day_work_count = model.NewIntVar(
            0,
            NUM_DAYS * 2,
            f"total_day_work_count_s{staff}"
        )

        model.Add(
            total_day_work_count
            == sum(
                work_model_3d[staff, day, DAY_SHIFT]
                + iw1_work_model_3d[staff, day, DAY_SHIFT]
                for day in range(2, NUM_DAYS - 1)
            )
        )

        shortage_from_20 = model.NewIntVar(
            0,
            IW1_DAY_COUNT_MAX,
            f"iw1_day_shortage_from_20_s{staff}"
        )

        model.AddMaxEquality(
            shortage_from_20,
            [
                IW1_DAY_COUNT_MAX - total_day_work_count,
                0,
            ]
        )

        capped_shortage = model.NewIntVar(
            0,
            IW1_DAY_COUNT_MAX - IW1_DAY_COUNT_MIN_CAP,
            f"iw1_day_capped_shortage_s{staff}"
        )

        # capped_shortage = min(shortage_from_20, 13)
        # 7回以下はすべて13として扱う
        model.AddMinEquality(
            capped_shortage,
            [
                shortage_from_20,
                IW1_DAY_COUNT_MAX - IW1_DAY_COUNT_MIN_CAP,
            ]
        )

        for day in range(2, NUM_DAYS - 1):

            iw1_day_penalty = model.NewIntVar(
                0,
                (IW1_DAY_COUNT_MAX - IW1_DAY_COUNT_MIN_CAP)
                * IW1_DAY_ASSIGN_PENALTY_UNIT,
                f"iw1_day_assign_penalty_s{staff}_d{day}"
            )

            model.Add(
                iw1_day_penalty
                == capped_shortage * IW1_DAY_ASSIGN_PENALTY_UNIT
            ).OnlyEnforceIf(iw1_work_model_3d[staff, day, DAY_SHIFT])

            model.Add(
                iw1_day_penalty == 0
            ).OnlyEnforceIf(iw1_work_model_3d[staff, day, DAY_SHIFT].Not())

            objective_terms.append(iw1_day_penalty)

    # =====================
    # 目的18：本務3日勤連続を避ける
    # =====================

    THREE_CONSECUTIVE_DAY_WORK_PENALTY = 50

    for staff in range(NUM_STAFF):
        for day in range(2, NUM_DAYS - 3):

            three_day_work = model.NewBoolVar(
                f"three_consecutive_day_work_s{staff}_d{day}"
            )

            three_day_sum = (
                work_model_3d[staff, day, DAY_SHIFT]
                + work_model_3d[staff, day + 1, DAY_SHIFT]
                + work_model_3d[staff, day + 2, DAY_SHIFT]
            )

            model.Add(three_day_sum == 3).OnlyEnforceIf(three_day_work)
            model.Add(three_day_sum <= 2).OnlyEnforceIf(three_day_work.Not())

            objective_terms.append(
                THREE_CONSECUTIVE_DAY_WORK_PENALTY * three_day_work
            )

    # =====================
    # 目的19：本務夜勤人数を3人以内に抑える
    #
    # 3人以下 → penalty 0
    # 4人     → penalty 10000
    # 5人     → penalty 20000
    # 6人     → penalty 30000
    # =====================

    MAX_NIGHT_STAFF = 3
    NIGHT_STAFF_OVER_MAX_PENALTY = 10000

    for day in range(2, NUM_DAYS - 1):

        actual_night_staff_count = sum(
            work_model_3d[staff, day, NIGHT_SHIFT]
            for staff in range(NUM_STAFF)
        )

        night_staff_over_max = model.NewIntVar(
            0,
            NUM_STAFF - MAX_NIGHT_STAFF,
            f"night_staff_over_max_d{day}"
        )

        model.AddMaxEquality(
            night_staff_over_max,
            [
                actual_night_staff_count - MAX_NIGHT_STAFF,
                0,
            ]
        )

        objective_terms.append(
            NIGHT_STAFF_OVER_MAX_PENALTY
            * night_staff_over_max
        )

    model.Minimize(sum(objective_terms))