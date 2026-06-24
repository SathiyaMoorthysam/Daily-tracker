/* ════════════════════════════════════════════════
   HABITOS — GOOGLE APPS SCRIPT (Sheets backend)
   Handles BOTH read (doGet) and write (doPost).

   Deploy → New deployment → Web app
   Execute as: Me | Who has access: Anyone
════════════════════════════════════════════════ */

const SHEET_NAME = 'Daily Log';
const DASH_NAME  = 'Dashboard';

const COLUMNS = [
  'Date','Day','Steps','Exercise (min)','Water (L)','Sleep (hrs)',
  'Calories (kcal)','Protein (g)',
  'No Smoking','No Drinking','Only Water','No Sugar','No Junk Food',
  'Study (hrs)','Reading (pages)','Breathing (min)',
  'Daily Score','Health Score','Productivity Score','Discipline Score',
  'Completion %','Streak','Motivational Message',
];

// Map sheet header → JS field name
const FIELD_MAP = {
  'Date':'date','Day':'day',
  'Steps':'steps','Exercise (min)':'exercise','Water (L)':'water','Sleep (hrs)':'sleep',
  'Calories (kcal)':'calories','Protein (g)':'protein',
  'No Smoking':'smoking','No Drinking':'drinking','Only Water':'onlywater',
  'No Sugar':'sugar','No Junk Food':'junk',
  'Study (hrs)':'study','Reading (pages)':'reading','Breathing (min)':'breathing',
  'Daily Score':'dailyScore','Health Score':'healthScore',
  'Productivity Score':'productivityScore','Discipline Score':'disciplineScore',
  'Completion %':'completionPct','Streak':'streak','Motivational Message':'motivationalMessage',
};

/* ════════════════════════════════════════════════
   doGet — READ endpoints
   ?action=getData          → all rows as JSON array
   ?action=getDate&date=X   → single row as JSON
   (no action)              → health check JSON
════════════════════════════════════════════════ */
function doGet(e) {
  const action = (e && e.parameter) ? e.parameter.action : null;

  if (action === 'getData') {
    return getAllRows();
  }
  if (action === 'getDate') {
    const date = e.parameter.date || '';
    return getRowByDate(date);
  }
  // Health check
  return jsonResp({ status:'ok', message:'HabitOS API running. Use POST to log data, GET ?action=getData to read.' });
}

/* ── Return all rows ── */
function getAllRows() {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) {
      return jsonResp({ status:'ok', records:[], count:0 });
    }
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const records = data.slice(1)
      .filter(row => row[0]) // skip empty rows
      .map(row => rowToObj(headers, row));
    return jsonResp({ status:'ok', records, count:records.length });
  } catch(err) {
    return jsonResp({ status:'error', message:err.toString() });
  }
}

/* ── Return one row by date ── */
function getRowByDate(date) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) {
      return jsonResp({ status:'notfound', record:null });
    }
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const row     = data.slice(1).find(r => String(r[0]) === date);
    if (row) return jsonResp({ status:'ok', record: rowToObj(headers, row) });
    return jsonResp({ status:'notfound', record:null });
  } catch(err) {
    return jsonResp({ status:'error', message:err.toString() });
  }
}

/* ── Convert a sheet row to a JS object ── */
function rowToObj(headers, row) {
  const obj = {};
  headers.forEach((h, i) => {
    const key = FIELD_MAP[h] || h.toLowerCase().replace(/\s+/g,'_');
    obj[key]  = row[i];
  });
  return obj;
}

/* ════════════════════════════════════════════════
   doPost — WRITE endpoint
════════════════════════════════════════════════ */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.test) return jsonResp({ status:'ok', message:'HabitOS Google Sheets is live!' });

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getOrCreate(ss, SHEET_NAME);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(COLUMNS);
      formatHeader(sheet);
    }

    const row      = buildRow(data);
    const existing = findByDate(sheet, data.date);
    if (existing > 0) sheet.getRange(existing, 1, 1, row.length).setValues([row]);
    else              sheet.appendRow(row);

    applyConditional(sheet);
    buildDashboard(ss, sheet);

    return jsonResp({ status:'ok', message:'Saved.' });
  } catch(err) {
    return jsonResp({ status:'error', message:err.toString() });
  }
}

function buildRow(d) {
  return [
    d.date||'', d.day||'',
    d.steps||0, d.exercise||0, d.water||0, d.sleep||0, d.calories||0, d.protein||0,
    d.smoking||'No', d.drinking||'No', d.onlywater||'No', d.sugar||'No', d.junk||'No',
    d.study||0, d.reading||0, d.breathing||0,
    d.dailyScore||0, d.healthScore||0, d.productivityScore||0, d.disciplineScore||0,
    d.completionPct||0, d.streak||0, d.motivationalMessage||'',
  ];
}

function formatHeader(sheet) {
  const r = sheet.getRange(1,1,1,COLUMNS.length);
  r.setBackground('#1a1d2e').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1,100); sheet.setColumnWidth(23,280);
}

function findByDate(sheet, date) {
  const last = sheet.getLastRow();
  if (last < 2) return -1;
  const vals = sheet.getRange(2,1,last-1,1).getValues().flat();
  const idx  = vals.indexOf(date);
  return idx >= 0 ? idx+2 : -1;
}

function applyConditional(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  [17,18,19,20,21].forEach(col => {
    const rng   = sheet.getRange(2,col,last-1,1);
    const rules = sheet.getConditionalFormatRules();
    rules.push(
      SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(75).setBackground('#d1fae5').setFontColor('#065f46').setRanges([rng]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(50,74).setBackground('#fef3c7').setFontColor('#92400e').setRanges([rng]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(50).setBackground('#fee2e2').setFontColor('#991b1b').setRanges([rng]).build()
    );
    sheet.setConditionalFormatRules(rules);
  });
}

function buildDashboard(ss, logSheet) {
  let dash = ss.getSheetByName(DASH_NAME) || ss.insertSheet(DASH_NAME, 0);
  dash.clearContents(); dash.clearFormats();
  const lr  = logSheet.getLastRow();
  const log = `'${SHEET_NAME}'!`;

  dash.getRange('A1').setValue('⚡ HabitOS — Dashboard').setFontSize(18).setFontWeight('bold').setFontColor('#6366f1');
  dash.getRange('A2').setValue(`Updated: ${new Date().toLocaleString()}`).setFontSize(10).setFontColor('#888');
  dash.getRange('A4').setValue('KPI METRICS').setFontWeight('bold').setFontSize(12);

  const kpis = [
    ['Current Streak',  `=${log}V${lr}`],
    ['Best Streak',     `=MAX(${log}V2:V)`],
    ['Avg Daily Score', `=IFERROR(AVERAGE(${log}Q2:Q),0)`],
    ['Avg Completion',  `=IFERROR(AVERAGE(${log}U2:U),0)`],
    ['Days Logged',     `=COUNTA(${log}A2:A)`],
    ['Best Day Score',  `=MAX(${log}Q2:Q)`],
  ];
  kpis.forEach(([label,formula],i)=>{
    dash.getRange(5,i+1).setValue(label).setFontSize(9).setFontColor('#888').setHorizontalAlignment('center');
    dash.getRange(6,i+1).setFormula(formula).setFontSize(22).setFontWeight('bold').setFontColor('#6366f1').setHorizontalAlignment('center');
    dash.setColumnWidth(i+1,130);
  });
  dash.getRange(6,4).setNumberFormat('0"%"');

  // Last 7 days table
  dash.getRange('A9').setValue('LAST 7 DAYS').setFontWeight('bold').setFontSize(12);
  ['Date','Day','Daily Score','Health','Productivity','Discipline','Completion%','Streak'].forEach((h,i)=>{
    dash.getRange(10,i+1).setValue(h).setFontWeight('bold').setBackground('#1a1d2e').setFontColor('#fff').setHorizontalAlignment('center');
  });
  const from = Math.max(2, lr-6);
  for (let r=from; r<=lr; r++) {
    const d = 11+(r-from);
    [`=${log}A${r}`,`=${log}B${r}`,`=${log}Q${r}`,`=${log}R${r}`,`=${log}S${r}`,`=${log}T${r}`,`=${log}U${r}`,`=${log}V${r}`]
      .forEach((f,i)=>dash.getRange(d,i+1).setFormula(f));
  }

  // Habit consistency table
  dash.getRange('A20').setValue('HABIT CONSISTENCY').setFontWeight('bold').setFontSize(12);
  const habitRows = [
    ['Walking (≥10k)',    `=IFERROR(COUNTIF(${log}C2:C,">=10000")/COUNTA(${log}C2:C)*100,0)`],
    ['Exercise (≥45min)', `=IFERROR(COUNTIF(${log}D2:D,">=45")/COUNTA(${log}D2:D)*100,0)`],
    ['Water (≥4L)',       `=IFERROR(COUNTIF(${log}E2:E,">=4")/COUNTA(${log}E2:E)*100,0)`],
    ['Sleep (7-8h)',      `=IFERROR(COUNTIFS(${log}F2:F,">=7",${log}F2:F,"<=8")/COUNTA(${log}F2:F)*100,0)`],
    ['Calories in range', `=IFERROR(COUNTIFS(${log}G2:G,">=1600",${log}G2:G,"<=1800")/COUNTA(${log}G2:G)*100,0)`],
    ['Protein (≥90g)',    `=IFERROR(COUNTIF(${log}H2:H,">=90")/COUNTA(${log}H2:H)*100,0)`],
    ['No Smoking',        `=IFERROR(COUNTIF(${log}I2:I,"Yes")/COUNTA(${log}I2:I)*100,0)`],
    ['No Drinking',       `=IFERROR(COUNTIF(${log}J2:J,"Yes")/COUNTA(${log}J2:J)*100,0)`],
    ['Only Water',        `=IFERROR(COUNTIF(${log}K2:K,"Yes")/COUNTA(${log}K2:K)*100,0)`],
    ['No Sugar',          `=IFERROR(COUNTIF(${log}L2:L,"Yes")/COUNTA(${log}L2:L)*100,0)`],
    ['No Junk Food',      `=IFERROR(COUNTIF(${log}M2:M,"Yes")/COUNTA(${log}M2:M)*100,0)`],
    ['Study (≥1.5h)',     `=IFERROR(COUNTIF(${log}N2:N,">=1.5")/COUNTA(${log}N2:N)*100,0)`],
    ['Reading (≥2 pages)',`=IFERROR(COUNTIF(${log}O2:O,">=2")/COUNTA(${log}O2:O)*100,0)`],
    ['Breathing (≥5min)', `=IFERROR(COUNTIF(${log}P2:P,">=5")/COUNTA(${log}P2:P)*100,0)`],
  ];
  dash.getRange(21,1).setValue('Habit').setFontWeight('bold').setBackground('#e8eaf6');
  dash.getRange(21,2).setValue('Consistency %').setFontWeight('bold').setBackground('#e8eaf6');
  dash.setColumnWidth(1,200);
  habitRows.forEach(([label,formula],i)=>{
    dash.getRange(22+i,1).setValue(label);
    dash.getRange(22+i,2).setFormula(formula).setNumberFormat('0.0"%"').setHorizontalAlignment('center');
  });
  const cfRange = dash.getRange(22,2,habitRows.length,1);
  dash.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(80).setBackground('#d1fae5').setFontColor('#065f46').setRanges([cfRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(50,79).setBackground('#fef3c7').setFontColor('#92400e').setRanges([cfRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(50).setBackground('#fee2e2').setFontColor('#991b1b').setRanges([cfRange]).build(),
  ]);
  dash.autoResizeColumns(1,8);
}

function getOrCreate(ss, name) { return ss.getSheetByName(name)||ss.insertSheet(name); }
function jsonResp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
