let dashboardData = loadDashboardData();
let currentFilterMode = "single";
const completedQualityCharts = {};
const PRIMARY_HOME_EXCEL = "./chart-data/dashboard-sample.xlsx";

const els = {
  filterMode: document.getElementById("filterMode"),
  singleDateWrap: document.getElementById("singleDateWrap"),
  rangeDateWrap: document.getElementById("rangeDateWrap"),
  singleDate: document.getElementById("singleDate"),
  startDate: document.getElementById("startDate"),
  endDate: document.getElementById("endDate"),
  applyFilterBtn: document.getElementById("applyFilterBtn"),
  dataFileInput: document.getElementById("dataFileInput"),
  downloadTemplateBtn: document.getElementById("downloadTemplateBtn"),
  importStatus: document.getElementById("importStatus"),
  completedList: document.getElementById("completedList"),
  ongoingList: document.getElementById("ongoingList"),
  taskNav: document.getElementById("taskNav"),
  filterSummary: document.getElementById("filterSummary")
};

init();

async function init() {
  bindEvents();
  await autoLoadHomeDataFromExcel();
  resetDateInputsFromData();
  renderTaskNav();
  renderAll();
}

function bindEvents() {
  els.filterMode.addEventListener("click", (e) => {
    const btn = e.target.closest(".mode-btn");
    if (!btn) return;

    currentFilterMode = btn.dataset.mode;
    [...els.filterMode.querySelectorAll(".mode-btn")].forEach((x) =>
      x.classList.toggle("active", x === btn)
    );

    els.singleDateWrap.classList.toggle("hidden", currentFilterMode !== "single");
    els.rangeDateWrap.classList.toggle("hidden", currentFilterMode !== "range");
  });

  els.applyFilterBtn.addEventListener("click", () => {
    renderAll();
  });

  els.dataFileInput.addEventListener("change", onImportFileChange);
  els.downloadTemplateBtn.addEventListener("click", downloadExcelTemplate);
}

function renderAll() {
  const filteredTasks = getFilteredTasks();
  renderFilterSummary();
  renderOverview(filteredTasks);
}

async function autoLoadHomeDataFromExcel() {
  if (!window.XLSX) {
    setImportStatus("未检测到XLSX解析库，首页使用当前缓存数据", true);
    return;
  }

  try {
    const response = await fetch(PRIMARY_HOME_EXCEL, { cache: "no-store" });
    if (!response.ok) throw new Error(`${PRIMARY_HOME_EXCEL} 读取失败(${response.status})`);
    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const rows = workbook.SheetNames.flatMap((sheetName) =>
      XLSX.utils
        .sheet_to_json(workbook.Sheets[sheetName], { defval: "" })
        .map((row) => ({ ...row, __sheet: sheetName, __file: PRIMARY_HOME_EXCEL }))
    );
    const tasks = buildDashboardFromRows(rows);
    if (!tasks.length) {
      throw new Error("dashboard-sample.xlsx 已读取，但未解析到有效任务");
    }
    dashboardData = { tasks };
    saveDashboardData(dashboardData);
    setImportStatus("首页已从 dashboard-sample.xlsx 读取", false);
  } catch (error) {
    const tip =
      window.location.protocol === "file:"
        ? "（当前是 file:// 打开，建议用本地服务启动）"
        : "";
    dashboardData = { tasks: [] };
    saveDashboardData(dashboardData);
    setImportStatus(`未读取到 dashboard-sample.xlsx ${tip}：${error.message}`, true);
  }
}

function renderTaskNav() {
  if (!dashboardData.tasks.length) {
    els.taskNav.innerHTML = "";
    return;
  }

  els.taskNav.innerHTML = dashboardData.tasks
    .map(
      (task) =>
        `<a class="nav-btn" href="./task-detail.html?taskId=${encodeURIComponent(task.id)}">${task.name}</a>`
    )
    .join("");
}

function getFilteredTasks() {
  return dashboardData.tasks.map((task) => ({
    ...task,
    records: filterRecordsByDate(task.records)
  }));
}

function renderFilterSummary() {
  if (currentFilterMode === "single") {
    els.filterSummary.textContent = `当前筛选：${els.singleDate.value}`;
  } else {
    els.filterSummary.textContent = `当前筛选：${els.startDate.value} 至 ${els.endDate.value}`;
  }
}

function renderOverview(tasks) {
  clearCompletedQualityCharts();
  const completed = tasks.filter((t) => t.status === "completed");
  const ongoing = tasks.filter((t) => t.status === "ongoing");
  const completedSource = dashboardData.tasks.filter((t) => t.status === "completed");

  const completedMax = Math.max(1, ...completed.map((task) => summarizeTask(task).count));

  els.completedList.innerHTML = completed
    .map((task) => buildOverviewItem(task, completedMax, "completed"))
    .join("") || '<div class="no-data">暂无数据</div>';

  els.ongoingList.innerHTML = ongoing
    .map((task) => buildOverviewItem(task, 100, "ongoing"))
    .join("") || '<div class="no-data">暂无数据</div>';

  completed.forEach((task) => {
    const sourceTask = completedSource.find((x) => x.id === task.id) || task;
    renderTaskWeeklyQualityChart(sourceTask);
  });
}

function buildOverviewItem(task, maxCount, mode) {
  const summary = summarizeTask(task);
  const progressRatio = task.total ? Math.min(100, (summary.count / task.total) * 100) : 0;
  const ratio = mode === "ongoing" ? progressRatio.toFixed(1) : ((summary.count / maxCount) * 100).toFixed(1);
  const bigValue =
    mode === "ongoing" ? `${formatNum(summary.count)}/${formatNum(task.total)}` : `${formatNum(summary.count)}`;
  const unit = "条";
  const qualityLabel = mode === "ongoing" ? "平均一次性通过率" : "标注质量";
  const efficiencyText =
    mode === "completed"
      ? `${summary.efficiency.toFixed(1)} 条/天（标准 ${summary.standardEfficiency.toFixed(1)}，Gap ${formatSigned(summary.efficiency - summary.standardEfficiency)}）`
      : `${summary.efficiency.toFixed(1)} 条/天`;

  return `
    <div class="task-item">
      <div class="task-item-top">
        <span class="task-name">${task.name}</span>
      </div>
      <div class="big-num">${bigValue}<small>${unit}</small></div>
      <div class="meter"><span style="width:${ratio}%"></span></div>
      <div class="kpi-row">
        <div class="kpi">
          <label>日均标注效率</label>
          <strong>${efficiencyText}</strong>
        </div>
        <div class="kpi">
          <label>${qualityLabel}</label>
          <strong>${(summary.accuracy * 100).toFixed(2)}%</strong>
        </div>
      </div>
      ${
        mode === "completed"
          ? `<div class="chart-box" style="margin-top: 10px;">
               <h4>每周正确率变化</h4>
               <canvas id="weekly-quality-${task.id}" class="trend-canvas"></canvas>
             </div>`
          : ""
      }
    </div>
  `;
}

function summarizeTask(task) {
  const filteredRecords = task.records || [];

  const dailyTotals = filteredRecords.map((record) => ({
    date: record.date,
    total: record.annotators.reduce((sum, a) => sum + a.count, 0)
  }));

  const count = dailyTotals.reduce((sum, d) => sum + d.total, 0);
  const dayCount = filteredRecords.length || 1;
  const efficiency = count / dayCount;
  const avgAnnotatorCount =
    filteredRecords.length > 0
      ? filteredRecords.reduce((sum, r) => sum + (r.annotators || []).length, 0) / filteredRecords.length
      : 0;
  const standardEfficiency = (task.targetPerPersonPerDay || 0) * avgAnnotatorCount;

  const annotatorStatsMap = {};
  filteredRecords.forEach((record) => {
    record.annotators.forEach((a) => {
      const errorCount = Object.values(a.errors || {}).reduce((x, y) => x + y, 0);
      if (!annotatorStatsMap[a.name]) {
        annotatorStatsMap[a.name] = { name: a.name, count: 0, errorCount: 0 };
      }
      annotatorStatsMap[a.name].count += a.count;
      annotatorStatsMap[a.name].errorCount += errorCount;
    });
  });

  const annotatorStats = Object.values(annotatorStatsMap);
  const totalErrors = annotatorStats.reduce((sum, x) => sum + x.errorCount, 0);
  const accuracy = count ? (count - totalErrors) / count : 0;

  return { count, efficiency, accuracy, standardEfficiency };
}

function renderTaskWeeklyQualityChart(task) {
  if (!window.Chart) return;
  const canvas = document.getElementById(`weekly-quality-${task.id}`);
  if (!canvas) return;

  const weekMap = {};
  (task.records || []).forEach((record) => {
    const weekKey = getWeekStart(record.date);
    if (!weekMap[weekKey]) weekMap[weekKey] = { total: 0, errors: 0 };
    (record.annotators || []).forEach((a) => {
      const count = Number(a.count || 0);
      const errors = Object.values(a.errors || {}).reduce((x, y) => x + Number(y || 0), 0);
      weekMap[weekKey].total += count;
      weekMap[weekKey].errors += errors;
    });
  });

  const weeks = Object.keys(weekMap).sort();
  const values = weeks.map((w) => {
    const total = weekMap[w].total;
    const errors = weekMap[w].errors;
    return total > 0 ? ((total - errors) / total) * 100 : 0;
  });
  if (!weeks.length) return;

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  let yMin = Math.floor(minVal - 1);
  let yMax = Math.ceil(maxVal + 1);
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  yMin = Math.max(0, yMin);
  yMax = Math.min(100, yMax);
  if (yMin >= yMax) {
    yMin = Math.max(0, yMax - 2);
  }

  completedQualityCharts[task.id] = new Chart(canvas, {
    type: "line",
    data: {
      labels: weeks.map((w) => w.slice(5)),
      datasets: [
        {
          label: `${task.name}每周正确率(%)`,
          data: values,
          borderColor: "#16a34a",
          backgroundColor: "rgba(22,163,74,0.12)",
          pointRadius: 4,
          pointHoverRadius: 5,
          tension: 0.25,
          spanGaps: true,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#475569", maxRotation: 0, minRotation: 0 }, grid: { color: "rgba(226,232,240,0.35)" } },
        y: {
          min: yMin,
          max: yMax,
          ticks: { color: "#475569", callback: (v) => `${v}%` },
          grid: { color: "rgba(226,232,240,0.35)" }
        }
      }
    }
  });
}

function clearCompletedQualityCharts() {
  Object.values(completedQualityCharts).forEach((chart) => {
    if (chart && chart.destroy) chart.destroy();
  });
  Object.keys(completedQualityCharts).forEach((k) => delete completedQualityCharts[k]);
}

function getWeekStart(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dayOfMonth}`;
}

function filterRecordsByDate(records) {
  if (currentFilterMode === "single") {
    const selected = els.singleDate.value;
    if (!selected) return records;
    return records.filter((x) => x.date === selected);
  }

  const start = els.startDate.value;
  const end = els.endDate.value;
  if (!start || !end) return records;
  if (start > end) return [];

  return records.filter((x) => x.date >= start && x.date <= end);
}

function getAllDates(tasks) {
  const set = new Set();
  tasks.forEach((task) => {
    (task.records || []).forEach((r) => set.add(r.date));
    (task.qcRecords || []).forEach((r) => set.add(r.date));
  });
  return [...set].sort();
}

function formatNum(num) {
  return Number(num || 0).toLocaleString("zh-CN");
}

function formatSigned(num) {
  const n = Number(num || 0);
  const abs = Math.abs(n);
  return `${n >= 0 ? "+" : "-"}${formatNum(abs.toFixed(1))}`;
}

function resetDateInputsFromData() {
  const dates = getAllDates(dashboardData.tasks);
  const latestDate = dates[dates.length - 1] || "";
  els.singleDate.value = latestDate;
  els.startDate.value = dates[Math.max(0, dates.length - 7)] || latestDate;
  els.endDate.value = latestDate;
}

async function onImportFileChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  try {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    let importedTasks = [];

    if (ext === "json") {
      const text = await file.text();
      const data = JSON.parse(text);
      importedTasks = normalizeTasks(data.tasks || data);
    } else if (ext === "csv") {
      const text = await file.text();
      const rows = parseCSVRows(text);
      importedTasks = buildDashboardFromRows(rows);
    } else if (ext === "xlsx" || ext === "xls") {
      if (!window.XLSX) throw new Error("缺少XLSX解析库");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const rows = workbook.SheetNames.flatMap((sheetName) =>
        XLSX.utils
          .sheet_to_json(workbook.Sheets[sheetName], { defval: "" })
          .map((row) => ({ ...row, __sheet: sheetName }))
      );
      importedTasks = buildDashboardFromRows(rows);
    } else {
      throw new Error("仅支持 JSON / CSV / XLSX 文件");
    }

    if (!importedTasks.length) throw new Error("文件中未解析到有效任务数据");

    dashboardData = mergeDashboardData(dashboardData, { tasks: importedTasks });
    saveDashboardData(dashboardData);
    resetDateInputsFromData();
    renderTaskNav();
    renderAll();
    setImportStatus(`已导入：${file.name}（任务数 ${importedTasks.length}）`, false);
  } catch (error) {
    setImportStatus(`导入失败：${error.message}`, true);
  } finally {
    event.target.value = "";
  }
}

function setImportStatus(text, isError) {
  els.importStatus.textContent = text;
  els.importStatus.style.color = isError ? "#dc2626" : "#64748b";
}

function downloadExcelTemplate() {
  if (!window.XLSX) {
    setImportStatus("下载模板失败：缺少XLSX库", true);
    return;
  }

  const rows = [
    {
      任务ID: "cn_dialog_v2",
      任务名称: "中文对话意图V2",
      任务状态: "completed",
      任务总量: 6200,
      质检人数: 2,
      每人每日目标: 135,
      日期: "2026-03-01",
      标注员: "林晨",
      标注量: 138,
      错误明细: "漏标:2|错标:1",
      质检员: "",
      质检量: "",
      质检错误个数: "",
      质检错误明细: ""
    },
    {
      任务ID: "cn_dialog_v2",
      任务名称: "中文对话意图V2",
      任务状态: "completed",
      任务总量: 6200,
      质检人数: 2,
      每人每日目标: 135,
      日期: "2026-03-01",
      标注员: "",
      标注量: "",
      错误明细: "",
      质检员: "质检A",
      质检量: 120,
      质检错误个数: 3,
      质检错误明细: "漏检:2|误判:1"
    }
  ];

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "raw_data");
  XLSX.writeFile(wb, "dashboard-template.xlsx");
}

function normalizeTasks(rawTasks) {
  if (!Array.isArray(rawTasks)) return [];

  return rawTasks
    .map((task, index) => {
      const id = String(task.id || task.taskId || `task${index + 1}`);
      const records = Array.isArray(task.records) ? task.records : [];
      const qcRecords = Array.isArray(task.qcRecords) ? task.qcRecords : [];

      return {
        id,
        name: String(task.name || task.taskName || `任务${index + 1}`),
        status: normalizeStatus(task.status),
        total: toNumber(task.total),
        qcCount: toNumber(task.qcCount || task.qaCount || task.reviewerCount || task.质检人数),
        targetPerPersonPerDay: toNumber(task.targetPerPersonPerDay || task.target),
        records: records
          .map((record) => ({
            date: String(record.date || "").slice(0, 10),
            annotators: (record.annotators || []).map((a) => ({
              name: String(a.name || ""),
              count: toNumber(a.count),
              errors: normalizeErrors(a.errors)
            }))
          }))
          .filter((record) => record.date),
        qcRecords: qcRecords
          .map((record) => ({
            date: String(record.date || "").slice(0, 10),
            reviewers: (record.reviewers || []).map((r) => ({
              name: String(r.name || ""),
              count: toNumber(r.count),
              errorCount: toNumber(r.errorCount),
              errors: normalizeErrors(r.errors)
            }))
          }))
          .filter((record) => record.date)
      };
    })
    .filter((task) => task.name);
}

function buildDashboardFromRows(rows) {
  const taskMap = new Map();

  rows.forEach((row, idx) => {
    const taskIdRaw = getField(row, ["task_id", "任务ID", "任务id", "任务编号"]);
    const taskName = getField(row, ["task_name", "任务名称", "任务名"]) || `任务${idx + 1}`;
    const taskId = sanitizeId(taskIdRaw || taskName);
    if (!taskId) return;

    if (!taskMap.has(taskId)) {
      taskMap.set(taskId, {
        id: taskId,
        name: taskName,
        status: normalizeStatus(getField(row, ["status", "任务状态"])),
        total: toNumber(getField(row, ["total", "任务总量", "任务总数"])),
        qcCount: toNumber(getField(row, ["qc_count", "qa_count", "质检人数", "质检数"])),
        targetPerPersonPerDay: toNumber(getField(row, ["target_per_person_per_day", "每人每日目标", "目标线"])),
        recordMap: new Map(),
        qcRecordMap: new Map()
      });
    }

    const task = taskMap.get(taskId);
    if (!task.total) task.total = toNumber(getField(row, ["total", "任务总量", "任务总数"]));
    if (!task.targetPerPersonPerDay) {
      task.targetPerPersonPerDay = toNumber(
        getField(row, ["target_per_person_per_day", "每人每日目标", "目标线"])
      );
    }
    if (!task.qcCount) {
      task.qcCount = toNumber(getField(row, ["qc_count", "qa_count", "质检人数", "质检数"]));
    }

    const date = normalizeDate(getField(row, ["date", "日期", "标注日期", "质检日期"]));
    const sheetHint = String(row.__sheet || "").toLowerCase();
    const annotatorName = getField(row, ["annotator_name", "标注员", "姓名"]);
    const count = toNumber(getField(row, ["count", "标注量", "标注条数"]));
    const rowErrors = parseErrorsFromRow(row);
    const qcName = getField(row, ["qc_name", "qa_name", "质检员", "质检姓名", "质检人", "质检人员", "质检人员姓名"]);
    const qcAmount = toNumber(getField(row, ["qc_count_amount", "qc_amount", "质检量", "质检数量", "质检条数"]));
    const qcErrorCount = toNumber(getField(row, ["qc_error_count", "qa_error_count", "质检错误个数", "质检错误数"]));
    const qcErrors = parseQcErrorsFromRow(row, qcErrorCount);
    const genericRole = getField(row, ["role", "角色", "人员类型"]).toLowerCase();
    const genericErrorName = getField(row, ["error_name", "错误人名", "错误姓名"]);
    const genericErrorType = getField(row, ["error_type", "错误类型"]);
    const genericErrorCount = toNumber(getField(row, ["error_count", "错误个数"]));
    const annErrorName = getField(row, ["annotator_error_name", "标注错误人", "标注错误姓名"]);
    const annErrorType = getField(row, ["annotator_error_type", "标注错误类型"]);
    const annErrorCount = toNumber(getField(row, ["annotator_error_count", "标注错误个数"]));
    const qcErrorNameOnly = getField(row, ["qc_error_name", "qa_error_name", "质检错误人", "质检错误姓名"]);
    const qcErrorTypeOnly = getField(row, ["qc_error_type", "qa_error_type", "质检错误类型"]);
    const qcErrorCountOnly = toNumber(getField(row, ["qc_error_count", "qa_error_count", "质检错误个数", "质检错误数"]));

    if (date && annotatorName) {
      if (!task.recordMap.has(date)) {
        task.recordMap.set(date, { date, annotatorMap: new Map() });
      }
      const dayData = task.recordMap.get(date);
      if (!dayData.annotatorMap.has(annotatorName)) {
        dayData.annotatorMap.set(annotatorName, { name: annotatorName, count: 0, errors: {} });
      }
      const annotator = dayData.annotatorMap.get(annotatorName);
      annotator.count += count;
      Object.entries(rowErrors).forEach(([type, value]) => {
        annotator.errors[type] = (annotator.errors[type] || 0) + value;
      });
    }

    if (date && qcName) {
      if (!task.qcRecordMap.has(date)) {
        task.qcRecordMap.set(date, { date, reviewerMap: new Map() });
      }
      const qcDayData = task.qcRecordMap.get(date);
      if (!qcDayData.reviewerMap.has(qcName)) {
        qcDayData.reviewerMap.set(qcName, { name: qcName, count: 0, errorCount: 0, errors: {} });
      }
      const reviewer = qcDayData.reviewerMap.get(qcName);
      reviewer.count += qcAmount;
      reviewer.errorCount += qcErrorCount;
      Object.entries(qcErrors).forEach(([type, value]) => {
        reviewer.errors[type] = (reviewer.errors[type] || 0) + value;
      });
    }

    if (date && annErrorName && annErrorType && annErrorCount > 0) {
      attachAnnotatorError(task, date, annErrorName, annErrorType, annErrorCount);
    }
    if (date && qcErrorNameOnly && qcErrorTypeOnly && qcErrorCountOnly > 0) {
      attachQcError(task, date, qcErrorNameOnly, qcErrorTypeOnly, qcErrorCountOnly);
    }
    const isQcSheet = sheetHint.includes("质检") || sheetHint.includes("qc") || sheetHint.includes("qa");
    const isAnnotatorSheet = sheetHint.includes("标注") || sheetHint.includes("annotator");
    if (date && genericErrorName && genericErrorType && genericErrorCount > 0) {
      if (genericRole.includes("质检") || genericRole.includes("qc") || genericRole.includes("qa") || isQcSheet) {
        attachQcError(task, date, genericErrorName, genericErrorType, genericErrorCount);
      } else if (genericRole.includes("标注") || genericRole.includes("annotator") || isAnnotatorSheet || !genericRole) {
        attachAnnotatorError(task, date, genericErrorName, genericErrorType, genericErrorCount);
      }
    }
  });

  return [...taskMap.values()].map((task) => ({
    id: task.id,
    name: task.name,
    status: task.status,
    total: task.total,
    qcCount: task.qcCount,
    targetPerPersonPerDay: task.targetPerPersonPerDay,
    records: [...task.recordMap.values()]
      .map((record) => ({
        date: record.date,
        annotators: [...record.annotatorMap.values()]
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    qcRecords: [...task.qcRecordMap.values()]
      .map((record) => ({
        date: record.date,
        reviewers: [...record.reviewerMap.values()]
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }));
}

function getField(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return String(row[key]).trim();
    }
  }
  return "";
}

function parseErrorsFromRow(row) {
  const jsonText = getField(row, ["errors", "错误JSON"]);
  if (jsonText) {
    try {
      return normalizeErrors(JSON.parse(jsonText));
    } catch (_error) {
      return {};
    }
  }

  const pairText = getField(row, ["error_detail", "错误明细"]);
  if (pairText) {
    const result = {};
    pairText.split(/[|；;]+/).forEach((part) => {
      const [k, v] = part.split(/[:：]/);
      if (!k) return;
      result[k.trim()] = toNumber(v);
    });
    return result;
  }

  const errorType = getField(row, ["error_type", "错误类型"]);
  const errorCount = toNumber(getField(row, ["error_count", "错误个数"]));
  if (!errorType) return {};
  return { [errorType]: errorCount };
}

function parseQcErrorsFromRow(row, fallbackCount) {
  const jsonText = getField(row, ["qc_errors", "qa_errors", "质检错误JSON"]);
  if (jsonText) {
    try {
      return normalizeErrors(JSON.parse(jsonText));
    } catch (_error) {
      return {};
    }
  }

  const pairText = getField(row, ["qc_error_detail", "qa_error_detail", "质检错误明细"]);
  if (pairText) {
    const result = {};
    pairText.split(/[|；;]+/).forEach((part) => {
      const [k, v] = part.split(/[:：]/);
      if (!k) return;
      result[k.trim()] = toNumber(v);
    });
    return result;
  }

  const errorType = getField(row, ["qc_error_type", "qa_error_type", "质检错误类型"]);
  const errorCount = toNumber(getField(row, ["qc_error_count", "qa_error_count", "质检错误个数", "质检错误数"]));
  if (errorType) return { [errorType]: errorCount };
  if (fallbackCount > 0) return { 未分类: fallbackCount };
  return {};
}

function attachAnnotatorError(task, date, name, type, count) {
  if (!task.recordMap.has(date)) {
    task.recordMap.set(date, { date, annotatorMap: new Map() });
  }
  const dayData = task.recordMap.get(date);
  if (!dayData.annotatorMap.has(name)) {
    dayData.annotatorMap.set(name, { name, count: 0, errors: {} });
  }
  const annotator = dayData.annotatorMap.get(name);
  annotator.errors[type] = (annotator.errors[type] || 0) + count;
}

function attachQcError(task, date, name, type, count) {
  if (!task.qcRecordMap.has(date)) {
    task.qcRecordMap.set(date, { date, reviewerMap: new Map() });
  }
  const qcDayData = task.qcRecordMap.get(date);
  if (!qcDayData.reviewerMap.has(name)) {
    qcDayData.reviewerMap.set(name, { name, count: 0, errorCount: 0, errors: {} });
  }
  const reviewer = qcDayData.reviewerMap.get(name);
  reviewer.errors[type] = (reviewer.errors[type] || 0) + count;
  reviewer.errorCount += count;
}

function normalizeErrors(errors) {
  const result = {};
  if (!errors || typeof errors !== "object") return result;
  Object.entries(errors).forEach(([k, v]) => {
    if (!k) return;
    result[k] = toNumber(v);
  });
  return result;
}

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("ongoing") || value.includes("进行")) return "ongoing";
  if (value.includes("completed") || value.includes("完成")) return "completed";
  return "ongoing";
}

function normalizeDate(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toNumber(value) {
  const n = Number(String(value || "0").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function sanitizeId(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, "")
    .slice(0, 40);
}

function parseCSVRows(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i] || "";
    });
    return row;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function loadDashboardData() {
  try {
    const raw = localStorage.getItem("dashboardDataJson");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tasks)) return parsed;
    }
  } catch (_error) {
    // ignore local parse error
  }
  return { tasks: [] };
}

function saveDashboardData(data) {
  try {
    localStorage.setItem("dashboardDataJson", JSON.stringify(data));
  } catch (_error) {
    // ignore storage error
  }
}

function mergeDashboardData(base, incoming) {
  const baseTasks = Array.isArray(base?.tasks) ? base.tasks : [];
  const incomingTasks = Array.isArray(incoming?.tasks) ? incoming.tasks : [];
  const taskMap = new Map();

  baseTasks.forEach((task) => taskMap.set(task.id, cloneTask(task)));
  incomingTasks.forEach((task) => {
    const prev = taskMap.get(task.id);
    taskMap.set(task.id, prev ? mergeTask(prev, task) : cloneTask(task));
  });

  return { tasks: [...taskMap.values()] };
}

function mergeTask(a, b) {
  const merged = {
    id: b.id || a.id,
    name: b.name || a.name,
    status: b.status || a.status,
    total: b.total || a.total,
    qcCount: b.qcCount || a.qcCount || 0,
    targetPerPersonPerDay: b.targetPerPersonPerDay || a.targetPerPersonPerDay || 0,
    records: mergeRecordsByDate(a.records || [], b.records || [], "annotators"),
    qcRecords: mergeRecordsByDate(a.qcRecords || [], b.qcRecords || [], "reviewers")
  };
  return merged;
}

function mergeRecordsByDate(baseRecords, incomingRecords, key) {
  const dateMap = new Map();
  const addRecord = (record) => {
    if (!record?.date) return;
    if (!dateMap.has(record.date)) dateMap.set(record.date, new Map());
    const personMap = dateMap.get(record.date);
    (record[key] || []).forEach((p) => {
      if (!p?.name) return;
      if (!personMap.has(p.name)) {
        personMap.set(p.name, { ...p, errors: { ...(p.errors || {}) } });
        return;
      }
      const cur = personMap.get(p.name);
      cur.count = toNumber(cur.count) + toNumber(p.count);
      if ("errorCount" in cur || "errorCount" in p) {
        cur.errorCount = toNumber(cur.errorCount) + toNumber(p.errorCount);
      }
      Object.entries(p.errors || {}).forEach(([t, c]) => {
        cur.errors[t] = toNumber(cur.errors[t]) + toNumber(c);
      });
    });
  };

  baseRecords.forEach(addRecord);
  incomingRecords.forEach(addRecord);

  return [...dateMap.entries()]
    .map(([date, personMap]) => ({
      date,
      [key]: [...personMap.values()]
    }))
    .sort((x, y) => x.date.localeCompare(y.date));
}

function cloneTask(task) {
  return {
    ...task,
    records: (task.records || []).map((r) => ({
      date: r.date,
      annotators: (r.annotators || []).map((a) => ({ ...a, errors: { ...(a.errors || {}) } }))
    })),
    qcRecords: (task.qcRecords || []).map((r) => ({
      date: r.date,
      reviewers: (r.reviewers || []).map((q) => ({ ...q, errors: { ...(q.errors || {}) } }))
    }))
  };
}
