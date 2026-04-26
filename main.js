/* ─────────────────────────────────────────────
   副業税金積立シミュレーター — main.js
   ───────────────────────────────────────────── */

const STORAGE_KEY = 'fukugyo_tax_v2';
const FIELD_IDS   = ['main-income', 'side-income', 'current-month',
                     'cumulative-income', 'expenses'];

/* ── 税率テーブル（2024年度・国税庁No.2260） ── */
const TAX_BRACKETS = [
  { limit:  1950000, rate: 0.05, deduction:       0 },
  { limit:  3300000, rate: 0.10, deduction:   97500 },
  { limit:  6950000, rate: 0.20, deduction:  427500 },
  { limit:  9000000, rate: 0.23, deduction:  636000 },
  { limit: 18000000, rate: 0.33, deduction: 1536000 },
  { limit: 40000000, rate: 0.40, deduction: 2796000 },
  { limit: Infinity, rate: 0.45, deduction: 4796000 },
];

/* 給与所得控除（2020年改正後） */
function calcKyuyoKojyo(income) {
  if (income <= 1625000)  return 650000;
  if (income <= 1800000)  return income * 0.4  - 100000;
  if (income <= 3600000)  return income * 0.3  +  80000;
  if (income <= 6600000)  return income * 0.2  + 440000;
  if (income <= 8500000)  return income * 0.1  + 1100000;
  return 1950000;
}

/*
 * 社会保険料控除の概算（給与収入ベース）
 * 健康保険(協会けんぽ平均9.98%) + 厚生年金(18.3%) + 雇用保険(0.6%)
 * 労使折半のため被保険者負担は約14.44%
 */
function calcShakaiHoken(income) {
  return Math.round(income * 0.1444);
}

/* 課税所得→所得税額 */
function calcIncomeTax(taxableIncome) {
  if (taxableIncome <= 0) return 0;
  const bracket = TAX_BRACKETS.find(b => taxableIncome <= b.limit);
  return Math.max(0, taxableIncome * bracket.rate - bracket.deduction);
}

/* 数値フォーマット */
function fmtYen(n) {
  return Math.round(n).toLocaleString('ja-JP') + ' 円';
}

/* カウントアップアニメーション */
function countUp(el, target, ms) {
  ms = ms || 700;
  var startTime = null;
  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    var elapsed = timestamp - startTime;
    var t = Math.min(elapsed / ms, 1);
    var ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * ease).toLocaleString('ja-JP');
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = Math.round(target).toLocaleString('ja-JP');
  }
  requestAnimationFrame(step);
}

/* ── カンマ区切り入力フォーマット ──────────── */
function formatInputWithComma(el) {
  var raw = el.value.replace(/,/g, '');
  if (raw === '') return;
  var num = parseFloat(raw);
  if (!isNaN(num) && num >= 0) el.value = num.toLocaleString('ja-JP');
}

function stripCommaOnFocus(el) {
  el.value = el.value.replace(/,/g, '');
}

/* ── LocalStorage ──────────────────────────── */
function saveState() {
  var data = {};
  FIELD_IDS.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) data[id] = el.value.replace(/,/g, ''); // カンマなしで保存
  });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) {}
}

function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    var data = JSON.parse(raw);
    FIELD_IDS.forEach(function(id) {
      var el = document.getElementById(id);
      if (el && data[id] != null && data[id] !== '') {
        // セレクト以外はカンマ表示で復元
        if (id === 'current-month') {
          el.value = data[id];
        } else {
          var num = parseFloat(data[id]);
          el.value = isNaN(num) ? data[id] : num.toLocaleString('ja-JP');
        }
      }
    });
    if (data['cumulative-income'] || data['expenses']) openOptional();
  } catch(e) {}
}

/* ── 入力値取得（カンマ除去・バリデーション） ── */
function getNum(id, allowZero) {
  if (allowZero === undefined) allowZero = true;
  var raw = document.getElementById(id).value.replace(/,/g, '');
  var v = parseFloat(raw);
  if (isNaN(v)) return null;
  if (!allowZero && v <= 0) return null;
  return Math.max(0, v);
}

/* ── 任意フィールド トグル ──────────────────── */
function openOptional() {
  document.getElementById('optional-body').classList.add('open');
  document.getElementById('optional-chevron').classList.add('open');
}

function toggleOptional() {
  document.getElementById('optional-body').classList.toggle('open');
  document.getElementById('optional-chevron').classList.toggle('open');
}

function toggleTaxRef() {
  document.getElementById('taxref-body').classList.toggle('open');
  document.getElementById('taxref-chevron').classList.toggle('open');
}

/* ── メイン計算 ─────────────────────────────── */
function calculate() {
  var mainIncomeRaw = getNum('main-income', false);
  var sideIncomeRaw = getNum('side-income', false);
  var month         = parseInt(document.getElementById('current-month').value);
  var cumulative    = getNum('cumulative-income');
  if (cumulative === null) cumulative = 0;
  var expensesMonth = getNum('expenses');
  if (expensesMonth === null) expensesMonth = 0;

  if (mainIncomeRaw === null || sideIncomeRaw === null) {
    alert('本業年収と今月の副業収入を入力してください。');
    return;
  }

  var mainIncome   = mainIncomeRaw * 10000;
  var sideIncome   = sideIncomeRaw;
  var remainMonths = 13 - month; // 今月を含む残り月数

  /*
   * 年間副業収入の推計
   * 累計：今月以前の確定実績（入力値をそのまま使用）
   * 今月以降：今月ペースで残り月数分続くと仮定
   */
  var annualSideGross = cumulative + sideIncome * remainMonths;

  /*
   * 経費の年間推計：今月経費×12ヶ月
   * ※累計入力時でも経費は年間一定として扱う
   */
  var annualExpenses = expensesMonth * 12;
  var annualSideNet  = Math.max(0, annualSideGross - annualExpenses);

  /* 本業の給与所得・社会保険料控除・基礎控除 */
  var kyuyoKojyo   = calcKyuyoKojyo(mainIncome);
  var shakaiHoken  = calcShakaiHoken(mainIncome);
  var kyuyoShotoku = Math.max(0, mainIncome - kyuyoKojyo);
  var kisoKojyo    = 580000;
  var totalKojyo   = kisoKojyo + shakaiHoken;

  /* 課税所得（本業のみ / 本業＋副業） */
  var mainTaxable  = Math.max(0, kyuyoShotoku - totalKojyo);
  var totalTaxable = Math.max(0, kyuyoShotoku + annualSideNet - totalKojyo);

  /*
   * 所得税：副業分の増加額＋復興特別所得税2.1%
   * 年間副業純所得が20万円以下の場合、所得税の確定申告は原則不要のため0円
   */
  var under20man = annualSideNet <= 200000;
  var totalIT    = calcIncomeTax(totalTaxable);
  var mainIT     = calcIncomeTax(mainTaxable);
  var sideIT     = under20man ? 0 : Math.max(0, totalIT - mainIT) * 1.021;

  /* 住民税（所得割10%＋森林環境税1,000円）※20万円以下でも住民税は発生 */
  var sideRT = annualSideNet * 0.10 + 1000;

  /* 合計・積立額 */
  var totalTax       = sideIT + sideRT;
  var monthlyReserve = Math.ceil(totalTax / remainMonths);
  var netAnnual      = Math.max(0, annualSideNet - totalTax);

  /* 積立率（上限表示付き） */
  var reservePct = sideIncome > 0
    ? Math.min(999, Math.round((monthlyReserve / sideIncome) * 100))
    : 0;
  var reservePctLabel = reservePct >= 999
    ? '100%以上（今月収入を超える積立が必要です）'
    : ('約 ' + reservePct + '%');

  /* ── DOM更新 ────────────────────────────── */
  var resultCard = document.getElementById('result-card');
  resultCard.classList.add('show');

  /* カウントアップ */
  var amountEl = document.getElementById('result-amount');
  amountEl.textContent = '0';
  setTimeout(function() {
    countUp(amountEl, monthlyReserve);
    /* カウントアップ完了後にフォントサイズ調整 */
    setTimeout(function() { adjustAmountFontSize(amountEl); }, 750);
  }, 50);

  /* 20万円以下の場合は注記を追加 */
  var descBase = '年間税額の参考値 ' + Math.round(totalTax).toLocaleString('ja-JP') + ' 円 ÷ 残り ' + remainMonths + ' ヶ月（概算）';
  if (under20man) {
    descBase += '（副業純所得20万円以下のため所得税参考値は0円・住民税のみ）';
  }
  document.getElementById('result-desc').textContent = descBase;
  document.getElementById('result-badge').textContent = '副業収入の ' + reservePctLabel + ' を取り置く目安';

  document.getElementById('bd-income-tax').textContent   = fmtYen(sideIT);
  document.getElementById('bd-resident-tax').textContent = fmtYen(sideRT);
  document.getElementById('bd-total-tax').textContent    = fmtYen(totalTax);
  document.getElementById('bd-net').textContent          = fmtYen(netAnnual);

  /* プログレスバー */
  var passedMonths = month - 1;
  var pct = Math.round((passedMonths / 12) * 100);
  document.getElementById('progress-fill').style.width   = pct + '%';
  document.getElementById('progress-passed').textContent = '経過 ' + passedMonths + ' ヶ月';
  document.getElementById('progress-remain').textContent = '残り ' + remainMonths + ' ヶ月';

  resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  saveState();
}

/* ── 初期化 ─────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  /* 現在月を自動セット（ストレージ復元で上書きされる） */
  document.getElementById('current-month').value = new Date().getMonth() + 1;

  /* ストレージ復元 */
  loadState();

  /* 入力制御・カンマフォーマットのイベント設定 */
  /* 桁数上限：本業年収5桁（最大99999万円）、その他10桁 */
  var numFieldDefs = [
    { id: 'main-income',        maxDigits: 5  },
    { id: 'side-income',        maxDigits: 10 },
    { id: 'cumulative-income',  maxDigits: 10 },
    { id: 'expenses',           maxDigits: 10 },
  ];
  numFieldDefs.forEach(function(def) {
    var el = document.getElementById(def.id);
    if (!el) return;
    /* 不正入力を弾く・桁数制限 */
    sanitizeNumericInput(el, def.maxDigits);
    /* フォーカス時：カンマを除去して編集可能に */
    el.addEventListener('focus', function() { stripCommaOnFocus(el); });
    /* フォーカスアウト時：カンマ付きで表示＋保存 */
    el.addEventListener('blur', function() {
      formatInputWithComma(el);
      saveState();
    });
  });

  /* セレクトは変更時に保存 */
  var monthEl = document.getElementById('current-month');
  if (monthEl) monthEl.addEventListener('change', saveState);
});

/* ── 入力制御（不正文字・全角・負の値を弾く） ── */
function sanitizeNumericInput(el, maxDigits) {
  el.addEventListener('keydown', function(e) {
    /* 許可するキー：数字・バックスペース・Delete・矢印・Tab・Home・End */
    var allowed = [
      'Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
      'Tab','Home','End','Enter'
    ];
    var isDigit = (e.key >= '0' && e.key <= '9');
    if (!isDigit && allowed.indexOf(e.key) === -1) {
      /* Ctrl/Cmd + A/C/V/X は許可 */
      if (!(e.ctrlKey || e.metaKey)) e.preventDefault();
    }
  });

  el.addEventListener('input', function() {
    /* 全角数字→半角に変換 */
    var val = el.value.replace(/[０-９]/g, function(c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
    /* 数字とカンマ以外を除去 */
    val = val.replace(/[^0-9,]/g, '');
    /* カンマを除去して桁数チェック */
    var digits = val.replace(/,/g, '');
    if (digits.length > maxDigits) digits = digits.slice(0, maxDigits);
    /* 先頭の0を除去（0だけの場合はそのまま） */
    digits = digits.replace(/^0+(\d)/, '$1');
    el.value = digits;
  });
}

/* ── 積立額の桁数に応じてフォントサイズを縮小 ── */
function adjustAmountFontSize(el) {
  var len = el.textContent.replace(/,/g, '').length;
  if      (len <= 7)  el.style.fontSize = '';       /* デフォルト */
  else if (len <= 9)  el.style.fontSize = '38px';
  else if (len <= 11) el.style.fontSize = '28px';
  else                el.style.fontSize = '22px';
}
