/**
 * GoFinSim 源泉徴収税額シミュレーター
 * main.js
 * 計算基準：2025年分（令和7年分）および2026年分（令和8年分）
 * 根拠：所得税法第204条・国税庁 No.2795
 */

'use strict';

/* =============================================
   定数
   ============================================= */
const TAX_RATE_LOW     = 0.1021;    // 100万円以下
const TAX_RATE_HIGH    = 0.2042;    // 100万円超の部分
const THRESHOLD        = 1000000;   // 二段階切替ライン（円）
const MAX_INPUT_DIGITS = 10;        // 入力桁数上限
const STORAGE_KEY      = 'withholding_input';

/* =============================================
   DOM取得
   ============================================= */
const invoiceInput    = document.getElementById('invoice-amount');
const errorMsg        = document.getElementById('error-message');
const calcBtn         = document.getElementById('calc-btn');
const resultSection   = document.getElementById('result-section');
const resultWithhold  = document.getElementById('result-withholding');
const resultNet       = document.getElementById('result-net-amount');
const resultRate      = document.getElementById('result-tax-rate');
const resultBreakdown = document.getElementById('result-breakdown');
const recalcBtn       = document.getElementById('recalc-btn');

/* =============================================
   計算ロジック
   ============================================= */

/**
 * 源泉徴収税額を計算する
 * @param {number} amount - 請求金額（税抜または税込の数値）
 * @returns {number} - 源泉徴収税額（円未満切り捨て）
 */
function calcWithholding(amount) {
  if (amount <= THRESHOLD) {
    return Math.floor(amount * TAX_RATE_LOW);
  } else {
    return Math.floor(
      THRESHOLD * TAX_RATE_LOW +
      (amount - THRESHOLD) * TAX_RATE_HIGH
    );
  }
}

/**
 * 差引振込額を計算する
 * @param {number} amount - 請求金額
 * @param {number} tax    - 源泉徴収税額
 * @returns {number}
 */
function calcNetAmount(amount, tax) {
  return amount - tax;
}

/* =============================================
   フォーマット・パース
   ============================================= */

/**
 * 数値を3桁カンマ区切り文字列に変換する
 * @param {number} n
 * @returns {string}
 */
function formatNumber(n) {
  return n.toLocaleString('ja-JP');
}

/**
 * 入力文字列からカンマを除去して数値に変換する
 * @param {string} str
 * @returns {number} - 変換できない場合はNaN
 */
function parseInput(str) {
  const cleaned = str.replace(/,/g, '').trim();
  return cleaned === '' ? NaN : Number(cleaned);
}

/* =============================================
   バリデーション
   ============================================= */

/**
 * 入力値を検証する
 * @param {number} amount
 * @returns {string} - エラーメッセージ（正常時は空文字）
 */
function validateInput(amount) {
  if (isNaN(amount) || invoiceInput.value.trim() === '') {
    return '請求金額を入力してください';
  }
  if (amount <= 0) {
    return '1円以上の金額を入力してください';
  }
  return '';
}

/* =============================================
   エラー表示
   ============================================= */

function showError(msg) {
  errorMsg.textContent = msg;
}

function clearError() {
  errorMsg.textContent = '';
}

/* =============================================
   結果表示
   ============================================= */

/**
 * 結果エリアを更新して表示する
 * @param {number} amount - 請求金額
 * @param {number} tax    - 源泉徴収税額
 * @param {number} net    - 差引振込額
 */
function renderResult(amount, tax, net) {
  resultWithhold.textContent = formatNumber(tax);
  resultNet.textContent      = formatNumber(net);

  // 適用税率の表示
  if (amount <= THRESHOLD) {
    resultRate.textContent = '適用税率：10.21%（所得税10% ＋ 復興特別所得税0.21%）';
    resultBreakdown.textContent = '';
  } else {
    const overAmount = amount - THRESHOLD;
    resultRate.textContent = '適用税率：二段階計算（100万円以下：10.21% ／ 超過分：20.42%）';
    resultBreakdown.textContent =
      '内訳：（1,000,000円 × 10.21%）＋（' +
      formatNumber(overAmount) + '円 × 20.42%）';
  }

  // 結果エリアを表示
  resultSection.classList.add('is-visible');

  // スマホでの結果自動スクロール
  setTimeout(() => {
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

/* =============================================
   ローカルストレージ
   ============================================= */

function saveToStorage() {
  try {
    const data = { invoiceAmount: invoiceInput.value };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // プライベートブラウジング等でlocalStorageが使えない場合は無視
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.invoiceAmount) {
      invoiceInput.value = data.invoiceAmount;
    }
  } catch (e) {
    // 復元失敗時はデフォルト状態のままにする
  }
}

/* =============================================
   入力処理
   ============================================= */

/**
 * 入力フィールドの値を整形する
 * - 数字・カンマ以外の文字を除去
 * - 桁数制限（MAX_INPUT_DIGITS桁）
 * - カンマ区切り表示
 */
function handleInput() {
  // カーソル位置保存
  const selStart = invoiceInput.selectionStart;

  // 数字のみ抽出
  let digits = invoiceInput.value.replace(/[^\d]/g, '');

  // 桁数制限
  if (digits.length > MAX_INPUT_DIGITS) {
    digits = digits.slice(0, MAX_INPUT_DIGITS);
  }

  // カンマ区切り表示
  const formatted = digits === '' ? '' : Number(digits).toLocaleString('ja-JP');
  invoiceInput.value = formatted;

  clearError();
}

/* =============================================
   計算ボタン処理
   ============================================= */

function handleCalcClick() {
  clearError();

  const amount = parseInput(invoiceInput.value);
  const errMsg = validateInput(amount);

  if (errMsg) {
    showError(errMsg);
    invoiceInput.focus();
    return;
  }

  const tax = calcWithholding(amount);
  const net = calcNetAmount(amount, tax);

  saveToStorage();
  renderResult(amount, tax, net);
}

/* =============================================
   再計算ボタン処理
   ============================================= */

function handleRecalcClick() {
  resultSection.classList.remove('is-visible');

  // 入力エリアへスクロール
  setTimeout(() => {
    document.getElementById('input-section').scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
    invoiceInput.focus();
  }, 50);
}

/* =============================================
   Enterキーで計算実行
   ============================================= */

function handleKeydown(e) {
  if (e.key === 'Enter') {
    handleCalcClick();
  }
}

/* =============================================
   イベント登録
   ============================================= */

invoiceInput.addEventListener('input', handleInput);
invoiceInput.addEventListener('keydown', handleKeydown);
calcBtn.addEventListener('click', handleCalcClick);
recalcBtn.addEventListener('click', handleRecalcClick);

/* =============================================
   初期化
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
});
