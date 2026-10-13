/* すくすくガーデン：共通の定数・小道具・汎用UI（ほかのスクリプトより先に読み込む）
 * 構成：WebRTC（PeerJS）による P2P。ホストのブラウザが唯一の正（authoritative）で、山・進行・CPUの思考はホストだけが持ちます。
 * 参加者の端末には「みんなに見えている情報」だけが送られます（裏向きの山は枚数だけ。並び順は送らない）。
 */
'use strict';
var $ = function (id) { return document.getElementById(id); };
var L = window.LN;
var Q = new URLSearchParams(location.search);
var CFG = window.KR_CONFIG || window.SR_CONFIG || {};
var ICE = (CFG.iceServers && CFG.iceServers.length) ? CFG.iceServers : [{ urls: 'stun:stun.l.google.com:19302' }];
if (Q.get('ice')) ICE = Q.get('ice').split(',').map(function (u) { return { urls: u }; });   // テスト・独自環境用
var PEER_OPTS = Object.assign({ debug: 1, config: { iceServers: ICE } }, CFG.peer || {});
var ID_PREFIX = 'sukusuku-v1-', CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var TURBO = Q.has('turbo');
var T = TURBO ? { cpu: [60, 120], draw: 80, off: 1200, end: 1500, awaken: 2500, k: 0.15 } : { cpu: [800, 1400], draw: 900, off: 9000, end: 12000, awaken: 7500, k: 1 };
var MAX_HUMANS = 5, HB_MS = 3000, LOST_MS = 10000;
var LV = { weak: '弱い', normal: '普通', strong: '強い', ultra: 'アストラウルトラ😎' };
var LV_KEYS = ['weak', 'normal', 'strong', 'ultra'];
var CH = {}; window.LN_CHARS.forEach(function (c) { CH[c.id] = c; });
var CH_KEYS = window.LN_CHARS.map(function (c) { return c.id; });
var GAME_TITLE = 'すくすくガーデン';
var LS_ID = 'ln-client-id', LS_NAME = 'ln-name', LS_HOST = 'ln-host-room', SS_CLIENT = 'ln-joined', LS_SOUND = 'ln-sound-off';
var host = null, client = null, lastView = null, pending = '';
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }
function load(k, json) { try { var v = localStorage.getItem(k); return json ? JSON.parse(v) : v; } catch (e) { return null; } }
function sstore(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function sload(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
function rid(n) { var s = ''; for (var i = 0; i < n; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; return s; }
var myId = load(LS_ID) || (function () { var v = rid(16); store(LS_ID, v); return v; })();
var soundOff = load(LS_SOUND) === '1';
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function rand(a) { return a[0] + Math.random() * (a[1] - a[0]); }
function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 8); }
var PARTY = window.FuuParty && window.FuuParty.info;   // ひろばの「みんなの部屋」から来たとき
function genCode() { if (PARTY && PARTY.host) return PARTY.code; var c = ''; for (var i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 4); }
function inviteUrl(code) { var u = location.origin + location.pathname + '?room=' + code; if (Q.get('ice')) u += '&ice=' + encodeURIComponent(Q.get('ice')); return u; }
function fill(t, o) { return t.replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ''; }); }

// ---------- 札（タネ札）の見た目：数が大きいほど育った植物（オリジナル） ----------
function plantOf(v) { return v <= 5 ? '🌱' : v <= 10 ? '🌿' : v <= 15 ? '🌷' : '🌻'; }
function hueOf(v) { return Math.round(150 - (v - 1) * 7.6); }   // 1：みどり → 20：オレンジ
function tileHtml(v, cls, attrs) {
  if (!v) return '<div class="tl back' + (cls ? ' ' + cls : '') + '"' + (attrs || '') + '><span class="pl">🌰</span></div>';
  return '<div class="tl' + (cls ? ' ' + cls : '') + '" style="--h:' + hueOf(v) + '"' + (attrs || '') + '><b>' + v + '</b><span class="pl">' + plantOf(v) + '</span></div>';
}
// 空きマスに入れられる数の範囲（表示用）
function rangeOf(g, i) {
  var r = i >> 2, c = i & 3, lo = 0, hi = 21, k, x;
  for (k = 0; k < 4; k++) { x = g[r * 4 + k]; if (!x || k === c) continue; if (k < c) lo = Math.max(lo, x); else hi = Math.min(hi, x); }
  for (k = 0; k < 4; k++) { x = g[k * 4 + c]; if (!x || k === r) continue; if (k < r) lo = Math.max(lo, x); else hi = Math.min(hi, x); }
  return [lo + 1, hi - 1];
}
var OPT_UI = {
  setup: { auto: { n: 'ふつうの初期配置', s: '4枚を小さい順に ななめへ自動で' }, michael: { n: 'シャハト式の初期配置', s: '1枚ずつ引いて、ななめの好きなマスへ' } },
  bruno: { n: 'ブルーノ式ルール', s: '同じ数が ななめ隣に並んだら、もう1回' },
  tour: { n: 'トーナメント', s: '人数ぶん連戦（全員が1回ずつ先手）' }
};

// ---------- 汎用UI ----------
function show(id) { ['title', 'lobby', 'game', 'end'].forEach(function (s) { $(s).classList.toggle('active', s === id); }); document.body.classList.toggle('in-game', id === 'game'); }
function overlay(id, on) { $(id).classList.toggle('active', on); }
var toastT;
function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3000); }
function banner(msg) { var b = $('banner'); b.textContent = msg || ''; b.classList.toggle('show', !!msg); }
function confirmBox(title, text, yes, cb) {
  $('cfTitle').textContent = title; $('cfText').textContent = text; $('cfYes').textContent = yes; $('cfNo').style.display = '';
  overlay('confirmModal', true);
  $('cfYes').onclick = function () { overlay('confirmModal', false); cb(); };
  $('cfNo').onclick = function () { overlay('confirmModal', false); };
}
function alertBox(msg) { confirmBox('お知らせ', msg, 'OK', function () {}); $('cfNo').style.display = 'none'; }
function connecting(on, title, text, onCancel) {
  overlay('connecting', on);
  if (on) { $('connTitle').textContent = title || '接続中…'; $('connText').textContent = text || ''; $('connCancel').onclick = onCancel || function () { location.href = location.pathname; }; }
}
function rulesHtml() {
  var li = [
    '<b>目標</b>：自分の庭（4×4の16マス）を、だれよりも早く タネ札でうめよう。',
    '<b>ただ1つのルール</b>：どの<b>横の列</b>も左→右へ、どの<b>縦の列</b>も上→下へ、数が<b>大きくなる</b>ように並べること。<b>同じ数</b>は同じ列に置けません（間があいていてもOK。7・8・9のように続かなくてもOK）。',
    '<b>札</b>：1〜20の札を<b>人数ぶん</b>（1人20枚）使います。全部 裏向きにまぜて山にします。',
    '<b>はじめ</b>：1人4枚引いて、ななめのマス（左上→右下）に<b>小さい順</b>で置きます。（シャハト式なら1枚ずつ引いて、ななめの好きなマスへ。置いたら動かせません）',
    '<b>自分の番</b>：どちらか1つ。<br>Ⓐ <b>山から1枚引く</b> → 空きマスに置く／庭の札と入れかえる／置かずに<b>場に出す</b>。<br>Ⓑ <b>場（表向き）の札を1枚取る</b> → 必ず庭に置く（空きマスか、入れかえ）。',
    '<b>入れかえ</b>た札は、表向きで場に出ます。ほかの人が取れるので気をつけよう。',
    '<b>勝ち</b>：庭の16マスを<b>最初にうめた人</b>がその場で勝ち。<br>まれに、だれかが山の<b>最後の1枚</b>を引いたら、その番のあとで終わり。空きマスが<b>いちばん少ない人</b>の勝ち（同じなら全員勝ち）。',
    '<b>ブルーノ式ルール</b>（オプション）：置いた札と<b>同じ数</b>が<b>ななめ隣</b>にあったら、もう1回自分の番。',
    '<b>トーナメント</b>（オプション）：人数ぶん続けて遊び、全員が1回ずつ先手。勝った人 +2点、ほかの人は<b>空きマス1つにつき −1点</b>。合計点の多い人が優勝。',
    '空いた席はCPU（ふーさん🐻・ミミ🐰・ロボミ🤖・ニャコ😺・ポチ太🐶・コンタ🦊）。強さは 弱い／普通／強い／アストラウルトラ😎。CPUは<b>見えている情報だけ</b>で考えます（山の並びはのぞきません。残りの数を数えるだけ）。'
  ];
  return li.map(function (t) { return '<li>' + t + '</li>'; }).join('');
}
