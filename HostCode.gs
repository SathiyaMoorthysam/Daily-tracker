/* ════════════════════════════════════════════════
   HABITOS — FULL HOSTED VERSION
   Google Apps Script: serves the web app AND
   handles Google Sheets data storage.

   HOW TO DEPLOY:
   1. Go to script.google.com → New project
   2. Rename project to "HabitOS"
   3. Paste this code into Code.gs
   4. Go to File → New → HTML file → name it "Index"
   5. Paste the contents of standalone.html into Index.html
   6. Deploy → New deployment → Web app
      • Execute as: Me
      • Who has access: Anyone (or Anyone with link)
   7. Copy the Web App URL — that is your hosted app!
   8. In the app, go to Settings and paste that same URL
      as the Sheets URL to enable data sync.
════════════════════════════════════════════════ */

const SHEET_NAME  = 'Daily Log';
const DASH_NAME   = 'Dashboard';

const COLUMNS = [
  'Date', 'Day', 'Steps', 'Exercise (min)', 'Water (L)', 'Sleep (hrs)',
  'Calories (kcal)', 'Protein (g)',
  'No Smoking', 'No Drinking', 'Only Water', 'No Sugar', 'No Junk Food',
  'Study (hrs)', 'Reading (pages)', 'Breathing (min)',
  'Daily Score', 'Health Score', 'Productivity Score', 'Discipline Score',
  'Completion %', 'Streak', 'Motivational Message',
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

/* ── Serve the Web App UI OR read data ── */
function doGet(e) {
  const action = (e && e.parameter) ? e.parameter.action : null;

  // Data read actions (called by the web app JS via fetch)
  if (action === 'getData')  return getAllRows();
  if (action === 'getDate')  return getRowByDate(e.parameter.date || '');

  // Default: serve the HTML app
  const html = HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('HabitOS — Daily Habit Tracker')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return html;
}

function getAllRows() {
  try {
    const ss    = SpreadsheetApp.openById(getSheetId());
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return jsonResp({status:'ok',records:[],count:0});
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const records = data.slice(1).filter(r=>r[0]).map(row=>rowToObj(headers,row));
    return jsonResp({status:'ok',records,count:records.length});
  } catch(err) { return jsonResp({status:'error',message:err.toString()}); }
}

function getRowByDate(date) {
  try {
    const ss    = SpreadsheetApp.openById(getSheetId());
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return jsonResp({status:'notfound',record:null});
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const row     = data.slice(1).find(r=>String(r[0])===date);
    if (row) return jsonResp({status:'ok',record:rowToObj(headers,row)});
    return jsonResp({status:'notfound',record:null});
  } catch(err) { return jsonResp({status:'error',message:err.toString()}); }
}

function rowToObj(headers, row) {
  const obj = {};
  headers.forEach((h,i) => { obj[FIELD_MAP[h]||h.toLowerCase().replace(/\s+/g,'_')] = row[i]; });
  return obj;
}

/* ── Receive habit data via POST ── */
function doPost(e) {
  try {
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch(_) {
      data = { test: true };
    }

    if (data.test) {
      return jsonResp({ status:'ok', message:'HabitOS is live on Apps Script!' });
    }

    const ss    = SpreadsheetApp.openById(getSheetId());
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

    return jsonResp({ status:'ok' });
  } catch(err) {
    return jsonResp({ status:'error', message: err.toString() });
  }
}

/* ── Sheet ID: store in Script Properties ── */
function getSheetId() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID');
  if (!id) {
    // Create a new sheet automatically
    const ss = SpreadsheetApp.create('HabitOS — Daily Tracker Data');
    id = ss.getId();
    props.setProperty('SHEET_ID', id);
  }
  return id;
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
  r.setBackground('#1a1d2e').setFontColor('#ffffff').setFontWeight('bold')
   .setFontSize(11).setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
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
    const rng   = sheet.getRange(2, col, last-1, 1);
    const rules = sheet.getConditionalFormatRules();
    rules.push(
      SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(75)
        .setBackground('#d1fae5').setFontColor('#065f46').setRanges([rng]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(50,74)
        .setBackground('#fef3c7').setFontColor('#92400e').setRanges([rng]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(50)
        .setBackground('#fee2e2').setFontColor('#991b1b').setRanges([rng]).build()
    );
    sheet.setConditionalFormatRules(rules);
  });
}

function buildDashboard(ss, logSheet) {
  let dash = ss.getSheetByName(DASH_NAME) || ss.insertSheet(DASH_NAME, 0);
  dash.clearContents(); dash.clearFormats();
  const lr  = logSheet.getLastRow();
  const log = `'${SHEET_NAME}'!`;

  dash.getRange('A1').setValue('⚡ HabitOS — Dashboard')
      .setFontSize(18).setFontWeight('bold').setFontColor('#6366f1');
  dash.getRange('A2').setValue(`Updated: ${new Date().toLocaleString()}`)
      .setFontSize(10).setFontColor('#888');
  dash.getRange('A4').setValue('KPI METRICS').setFontWeight('bold');

  const kpis = [
    ['Current Streak',  `=${log}V${lr}`],
    ['Best Streak',     `=MAX(${log}V2:V)`],
    ['Avg Daily Score', `=IFERROR(AVERAGE(${log}Q2:Q),0)`],
    ['Avg Completion',  `=IFERROR(AVERAGE(${log}U2:U),0)`],
    ['Days Logged',     `=COUNTA(${log}A2:A)`],
    ['Best Day Score',  `=MAX(${log}Q2:Q)`],
  ];
  kpis.forEach(([label, formula], i) => {
    dash.getRange(5,i+1).setValue(label).setFontSize(9).setFontColor('#888').setHorizontalAlignment('center');
    dash.getRange(6,i+1).setFormula(formula).setFontSize(22).setFontWeight('bold')
        .setFontColor('#6366f1').setHorizontalAlignment('center');
  });

  dash.getRange(8,1).setValue('LAST 7 DAYS').setFontWeight('bold');
  ['Date','Day','Score','Health','Prod.','Disc.','Completion%','Streak'].forEach((h,i)=>{
    dash.getRange(9,i+1).setValue(h).setFontWeight('bold').setBackground('#1a1d2e').setFontColor('#fff');
  });
  const from = Math.max(2, lr-6);
  for (let r=from; r<=lr; r++) {
    const d = 10+(r-from);
    [`=${log}A${r}`,`=${log}B${r}`,`=${log}Q${r}`,`=${log}R${r}`,
     `=${log}S${r}`,`=${log}T${r}`,`=${log}U${r}`,`=${log}V${r}`]
      .forEach((f,i) => dash.getRange(d,i+1).setFormula(f));
  }
  dash.autoResizeColumns(1,8);
}

function getOrCreate(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function jsonResp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
