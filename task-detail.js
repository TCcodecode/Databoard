let dashboardData = loadDashboardData();
let currentFilterMode = "single";
let activeTaskId = getTaskIdFromUrl();
let dailyTrendChart = null;

const els = {
  detailTitle: document.getElementById("detailTitle"),
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
  taskDetails: document.getElementById("taskDetails"),
  taskNav: document.getElementById("taskNav"),
  filterSummary: document.getElementById("filterSummary")
};

init();

function init() {
  ensureActiveTask();
  resetDateInputsFromData();
  renderTaskNav();
  bindEvents();
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

  els.taskNav.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-btn");
    if (!btn) return;

    activeTaskId = btn.dataset.taskId || "";
    updateUrlTaskId(activeTaskId);
    renderTaskNav();
    renderAll();
  });
}

function renderAll() {
  if (dailyTrendChart) {
    dailyTrendChart.destroy();
    dailyTrendChart = null;
  }
  ensureActiveTask();
  const filteredTasks = getFilteredTasks();
  renderFilterSummary();
  renderTaskDetails(filteredTasks);
}

function getFilteredTasks() {
  return dashboardData.tasks.map((task) => ({
    ...task,
    records: filterRecordsByDate(task.records)
  }));
}

function renderTaskNav() {
  els.taskNav.innerHTML = dashboardData.tasks
    .map(
      (task) =>
        `<button class="nav-btn ${task.id === activeTaskId ? "active" : ""}" data-task-id="${task.id}">${task.name}</button>`
    )
    .join("");
}

function renderFilterSummary() {
  if (currentFilterMode === "single") {
    els.filterSummary.textContent = `当前筛选：${els.singleDate.value}`;
  } else {
    els.filterSummary.textContent = `当前筛选：${els.startDate.value} 至 ${els.endDate.value}`;
  }
}

function renderTaskDetails(tasks) {
  if (!tasks.length || !activeTaskId) {
    els.taskDetails.innerHTML = '<div class="no-data">暂无任务数据</div>';
    els.detailTitle.textContent = "任务细分数据";
    return;
  }

  const task = tasks.find((t) => t.id === activeTaskId) || tasks[0];
  if (!task) {
    els.taskDetails.innerHTML = '<div class="no-data">暂无任务数据</div>';
    els.detailTitle.textContent = "任务细分数据";
    return;
  }

  els.detailTitle.textContent = `${task.name} - 细分数据`;

  const summary = summarizeTask(task);
  const progressRatio = task.total ? Math.min(100, (summary.count / task.total) * 100) : 0;
  const teamStatus = getCurrentTeamStatus(task);

  const qualityRows = summary.annotatorStats
    .map(
      (x) => `
        <tr>
          <td>${x.name}</td>
          <td>${formatNum(x.count)}</td>
          <td>${formatNum(x.errorCount)}</td>
          <td class="ok">${(x.accuracy * 100).toFixed(2)}%</td>
        </tr>
      `
    )
    .join("");

  const errorRows = Object.entries(summary.errorTypes)
    .map(
      ([type, count]) => `
        <tr>
          <td>${type}</td>
          <td>${formatNum(count)}</td>
        </tr>
      `
    )
    .join("");
  const qcQualityRows = summary.qcReviewerStats
    .map(
      (x) => `
        <tr>
          <td>${x.name}</td>
          <td>${formatNum(x.count)}</td>
          <td>${formatNum(x.errorCount)}</td>
          <td class="ok">${(x.accuracy * 100).toFixed(2)}%</td>
        </tr>
      `
    )
    .join("");
  const qcErrorRows = Object.entries(summary.qcErrorTypes)
    .map(
      ([type, count]) => `
        <tr>
          <td>${type}</td>
          <td>${formatNum(count)}</td>
        </tr>
      `
    )
    .join("");

  els.taskDetails.innerHTML = `
    <article class="task-card">
      <div class="task-title">
        <h3>${task.name}</h3>
        <span class="progress-text">任务进度：${formatNum(summary.count)} / ${formatNum(task.total)} (${progressRatio.toFixed(1)}%)</span>
      </div>
      <div class="meter"><span style="width:${progressRatio.toFixed(1)}%"></span></div>
      <div class="kpi-row" style="margin-top: 10px;">
        <div class="kpi">
          <label>当前标注人数</label>
          <strong>${teamStatus.annotatorCount} 人</strong>
        </div>
        <div class="kpi">
          <label>当前质检人数</label>
          <strong>${teamStatus.qcCount} 人</strong>
        </div>
      </div>

      <div class="task-grid chart-row" style="margin-top: 12px;">
        <div class="chart-box">
          <h4>每日产出总量趋势</h4>
          <canvas id="dailyOutputTrend" class="trend-canvas"></canvas>
        </div>
        <div class="table-box">
          <h4>${getAnnotatorTableTitle()}</h4>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>标注员</th>
                  <th>${currentFilterMode === "single" ? "当日标注量" : "区间日均标注量"}</th>
                  <th>${currentFilterMode === "single" ? "与日标准对比" : "与日标准对比"}</th>
                </tr>
              </thead>
              <tbody>${buildAnnotatorCompareRows(summary, task.targetPerPersonPerDay)}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="task-grid table-row" style="margin-top: 12px;">
        <div class="table-box">
          <h4>该任务下每位标注员质量情况</h4>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>标注量</th>
                  <th>错误个数</th>
                  <th>正确率</th>
                </tr>
              </thead>
              <tbody>${qualityRows || '<tr><td colspan="4" class="no-data">暂无数据</td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <div class="table-box">
          <h4>错误分类表</h4>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>错误类型</th>
                  <th>错误个数</th>
                </tr>
              </thead>
              <tbody>${errorRows || '<tr><td colspan="2" class="no-data">暂无数据</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="task-grid table-row" style="margin-top: 12px;">
        <div class="table-box">
          <h4>质检人员质量情况</h4>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>质检量</th>
                  <th>错误个数</th>
                  <th>正确率</th>
                </tr>
              </thead>
              <tbody>${qcQualityRows || '<tr><td colspan="4" class="no-data">暂无数据</td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <div class="table-box">
          <h4>质检错误分类表</h4>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>错误类型</th>
                  <th>错误个数</th>
                </tr>
              </thead>
              <tbody>${qcErrorRows || '<tr><td colspan="2" class="no-data">暂无数据</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
    </article>
  `;

  renderDailyOutputTrend(summary.dailyTotals);
}

function getAnnotatorTableTitle() {
  if (currentFilterMode === "single") {
    return `标注员当日标注量对比（日期：${els.singleDate.value || "-"})`;
  }
  return `标注员区间日均标注量对比（${els.startDate.value || "-"} 至 ${els.endDate.value || "-"})`;
}

function buildAnnotatorCompareRows(summary, targetPerPersonPerDay) {
  const baseDays = Math.max(1, summary.periodDayCount || 1);
  const standard = targetPerPersonPerDay;
  const rows = summary.annotatorStats
    .map((x) => {
      const amount = currentFilterMode === "single" ? x.count : x.count / baseDays;
      const delta = amount - standard;
      return {
        name: x.name,
        amount,
        delta
      };
    })
    .sort((a, b) => a.amount - b.amount);

  if (!rows.length) {
    return '<tr><td colspan="3" class="no-data">暂无数据</td></tr>';
  }

  return rows
    .map((x) => {
      const deltaText = `${x.delta >= 0 ? "+" : ""}${formatNum(x.delta)}`;
      return `
        <tr>
          <td>${x.name}</td>
          <td>${formatNum(x.amount)}</td>
          <td class="${x.delta >= 0 ? "ok" : ""}">${deltaText}</td>
        </tr>
      `;
    })
    .join("");
}

function getCurrentTeamStatus(task) {
  const records = task.records || [];
  const qcRecords = task.qcRecords || [];
  if (!records.length) {
    const qcLatestCount = getLatestQcReviewerCount(qcRecords);
    const qcFallback =
      qcLatestCount || Number(task.qcCount || 0) || (Array.isArray(task.reviewers) ? task.reviewers.length : 0);
    return { annotatorCount: 0, qcCount: qcFallback };
  }

  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1] || { annotators: [] };
  const annotatorCount = (latest.annotators || []).length;
  const qcLatestCount = getLatestQcReviewerCount(qcRecords);
  const qcFromTask =
    qcLatestCount || Number(task.qcCount || 0) || (Array.isArray(task.reviewers) ? task.reviewers.length : 0);
  const qcCount = qcFromTask || Math.max(1, Math.round(annotatorCount / 4));
  return { annotatorCount, qcCount };
}

function getLatestQcReviewerCount(qcRecords) {
  if (!qcRecords || !qcRecords.length) return 0;
  const sorted = [...qcRecords].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1] || { reviewers: [] };
  return (latest.reviewers || []).length;
}

function renderDailyOutputTrend(dailyTotals) {
  const canvas = document.getElementById("dailyOutputTrend");
  if (!canvas || !window.Chart) return;

  const values = dailyTotals.map((x) => x.total);
  const max = Math.max(10, ...values);
  dailyTrendChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: dailyTotals.map((x) => x.date.slice(5)),
      datasets: [
        {
          label: "每日产出总量",
          data: values,
          borderColor: "#0ea5e9",
          backgroundColor: "rgba(14,165,233,0.12)",
          pointRadius: 2,
          tension: 0.25,
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
          beginAtZero: true,
          max: Math.ceil(max * 1.15),
          ticks: { color: "#475569", maxTicksLimit: 5 },
          grid: { color: "rgba(226,232,240,0.35)" }
        }
      }
    }
  });
}

function summarizeTask(task) {
  const filteredRecords = task.records || [];
  const filteredQcRecords = filterRecordsByDate(task.qcRecords || []);

  const dailyTotals = filteredRecords.map((record) => ({
    date: record.date,
    total: record.annotators.reduce((sum, a) => sum + a.count, 0)
  }));

  const count = dailyTotals.reduce((sum, d) => sum + d.total, 0);
  const dayCount = filteredRecords.length || 1;
  const efficiency = count / dayCount;

  const annotatorStatsMap = {};
  const errorTypes = {};

  filteredRecords.forEach((record) => {
    record.annotators.forEach((a) => {
      const errorCount = Object.values(a.errors || {}).reduce((x, y) => x + y, 0);

      if (!annotatorStatsMap[a.name]) {
        annotatorStatsMap[a.name] = { name: a.name, count: 0, errorCount: 0 };
      }
      annotatorStatsMap[a.name].count += a.count;
      annotatorStatsMap[a.name].errorCount += errorCount;

      Object.entries(a.errors || {}).forEach(([type, num]) => {
        errorTypes[type] = (errorTypes[type] || 0) + num;
      });
    });
  });

  const annotatorStats = Object.values(annotatorStatsMap).map((x) => ({
    ...x,
    accuracy: x.count ? (x.count - x.errorCount) / x.count : 0
  }));

  const qcReviewerStatsMap = {};
  const qcErrorTypes = {};
  filteredQcRecords.forEach((record) => {
    (record.reviewers || []).forEach((r) => {
      const directError = toNumber(r.errorCount);
      const derivedError = Object.values(r.errors || {}).reduce((x, y) => x + toNumber(y), 0);
      const errorCount = directError || derivedError;
      if (!qcReviewerStatsMap[r.name]) {
        qcReviewerStatsMap[r.name] = { name: r.name, count: 0, errorCount: 0 };
      }
      qcReviewerStatsMap[r.name].count += toNumber(r.count);
      qcReviewerStatsMap[r.name].errorCount += errorCount;
      Object.entries(r.errors || {}).forEach(([type, num]) => {
        qcErrorTypes[type] = (qcErrorTypes[type] || 0) + toNumber(num);
      });
      if ((!r.errors || !Object.keys(r.errors).length) && errorCount > 0) {
        qcErrorTypes.未分类 = (qcErrorTypes.未分类 || 0) + errorCount;
      }
    });
  });
  const qcReviewerStats = Object.values(qcReviewerStatsMap).map((x) => ({
    ...x,
    accuracy: x.count ? (x.count - x.errorCount) / x.count : 0
  }));

  return { count, efficiency, dailyTotals, annotatorStats, errorTypes, qcReviewerStats, qcErrorTypes, periodDayCount: dayCount };
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

function resetDateInputsFromData() {
  const dates = getAllDates(dashboardData.tasks);
  const latestDate = dates[dates.length - 1] || "";
  els.singleDate.value = latestDate;
  els.startDate.value = dates[Math.max(0, dates.length - 7)] || latestDate;
  els.endDate.value = latestDate;
}

function ensureActiveTask() {
  if (!dashboardData.tasks.length) {
    activeTaskId = "";
    return;
  }

  if (activeTaskId && dashboardData.tasks.some((task) => task.id === activeTaskId)) return;
  activeTaskId = dashboardData.tasks[0].id;
  updateUrlTaskId(activeTaskId);
}

function getTaskIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("taskId") || "";
}

function updateUrlTaskId(taskId) {
  const params = new URLSearchParams(window.location.search);
  if (taskId) params.set("taskId", taskId);
  const next = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", next);
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
    ensureActiveTask();
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
