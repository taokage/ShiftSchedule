from pathlib import Path
from ortools.sat.python import cp_model

from shift_schedule_loader import load_shift_schedule_excel
from shift_schedule_solver import solve_shift_schedule
from shift_schedule_exporter import export_final_work_3d


def main():
    (
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
        staffname_1d,
        leader_level_1d,
        is_ew1_candidate_1d,
        iw1_priority_1d,
        day_week_2d,
        night_pair_ng_2d,
        input_file_path,
    ) = load_shift_schedule_excel()

    final_work_3d, final_ew1_work_3d, final_iw1_work_3d, status = solve_shift_schedule(
        unavailable_3d=unavailable_3d,
        avoid_3d=avoid_3d,
        mandatory_3d=mandatory_3d,
        ew1_mandatory_3d=ew1_mandatory_3d,
        iw1_mandatory_3d=iw1_mandatory_3d,
        optimal_staff_2d=optimal_staff_2d,
        min_work_count_2d=min_work_count_2d,
        min_leader_count_2d=min_leader_count_2d,
        ew1_count_2d=ew1_count_2d,
        iw1_count_2d=iw1_count_2d,
        staffno_1d=staffno_1d,
        leader_level_1d=leader_level_1d,
        is_ew1_candidate_1d=is_ew1_candidate_1d,
        iw1_priority_1d=iw1_priority_1d,
        night_pair_ng_2d=night_pair_ng_2d,
    )

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print("解が見つかりませんでした。")
        print(f"status = {status}")
        return

    print("解が見つかりました。")
    print(f"status = {status}")

    output_path = (
        Path(input_file_path).parent
        / "shift_schedule_result.xlsx"
    )

    output_file = export_final_work_3d(
        final_work_3d=final_work_3d,
        final_ew1_work_3d=final_ew1_work_3d,
        final_iw1_work_3d=final_iw1_work_3d,
        unavailable_3d=unavailable_3d,
        staffno_1d=staffno_1d,
        staffname_1d=staffname_1d,
        day_week_2d=day_week_2d,
        file_path=str(output_path),
    )

    print(f"Excel出力完了: {output_file}")


if __name__ == "__main__":
    main()