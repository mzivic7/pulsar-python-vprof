import json
import os
import sys

e = 2.718282
k = 6

def to_ms(time_s):
    """Convert time in seconds to milliseconds with fixed width"""
    if time_s >= 10:
        return float(f"{time_s:.2g}"), "s "
    return float(f"{time_s*1000:.2g}"), "ms"

project_path = sys.argv[1]
color_select = max(0, min(int(sys.argv[2]) - 1, 3))
format_line = sys.argv[3]

# load heatmap
stats_path = os.path.join(project_path, "stats.prof")
try:
    with open(stats_path, "r") as f:
        heatmaps = json.load(f)["h"]["heatmaps"]
except FileNotFoundError:
    sys.exit("No 'stats.prof' file found in project directory")

# build stats
stats = []
for file in heatmaps:
    filename = file["name"]
    heatmap = file["heatmap"]
    exec_count_map = file["executionCount"]
    file_stats = []
    exec_counts = []
    exec_times = []
    total_times = []
    longest_line = ""

    # expecting exec_count to have same len as heatmap
    for linenum, exec_time_raw in heatmap.items():
        exec_count = exec_count_map[linenum]
        exec_time, exec_time_unit = to_ms(exec_time_raw)
        total_time, total_time_unit = to_ms(exec_time * exec_count)
        exec_counts.append(exec_count)
        exec_times.append(exec_time_raw)
        total_times.append(exec_time_raw * exec_count)
        line_text = (
            format_line
            .replace("%calls", str(exec_count))
            .replace("%exec_time", f"{exec_time}{exec_time_unit}")
            .replace("total_time", f"{total_time}{total_time_unit}")
        )
        file_stats.append([
            int(linenum) - 1,
            line_text,
        ])

    values = (exec_counts, exec_times, total_times)[color_select]

    # create colors and find longest line
    for num, line in enumerate(file_stats):
        value = values[num]
        color_amount = 255 * (1 - e ** (-k * value / max(values)))
        color = [color_amount, 255 - color_amount, 0]
        line.append(color)
        if len(line[1]) > len(longest_line):
            longest_line = line[1]

    stats.append({
        "file_path": filename,
        "stats": file_stats,
        "longest": longest_line,
    })

# output to stdout
print(json.dumps(stats))
sys.stdout.flush()
sys.exit()
