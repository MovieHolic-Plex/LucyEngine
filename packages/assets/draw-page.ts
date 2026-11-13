// 그림 주체 비교 페이지를 만든다 (tmp/ 의 스크린샷을 묶는다):
//   cd packages/assets && pnpm exec tsx draw-page.ts
import sharp from "sharp";
import { writeFileSync } from "node:fs";
const T = "../../tmp/";
const jpg = async (f: string) => `data:image/jpeg;base64,${(await sharp(T + f).resize({ width: 1280 }).jpeg({ quality: 86 }).toBuffer()).toString("base64")}`;
const png = async (f: string) => `data:image/png;base64,${(await sharp(T + f).png({ compressionLevel: 9, palette: true }).toBuffer()).toString("base64")}`;
const V = [
  { key: "gemini", name: "A. Gemini 3.1 Flash Image", sub: "지금 제품이 쓰는 방식. 그림 모델이 그린 큰 그림을 코드가 줄이고 팔레트에 맞춘다. 걷기는 세 장을 흔들어 만든 것." },
  { key: "medium", name: "B. Fable 5.2 Medium", sub: "API 로 한 번씩만 시켰다. 그림을 보여 주지도, 고치게 하지도 않았다. 22종 전부 첫 시도에 성공, 가장 긴 것 100초, 출력 7.6만 토큰." },
  { key: "hand", name: "C. 이 세션의 Claude (Fable 5.2)", sub: "같은 도구로 직접 그리고, 결과를 눈으로 보며 두 번 고쳤다. B 와 같은 모델이고 차이는 되먹임뿐이다." },
];
const sec = async (title: string, look: string, pattern: string, f: (s: string) => Promise<string>) =>
  `<h2>${title}</h2><p class="look">${look}</p>` + (await Promise.all(V.map(async (v) => `<figure><figcaption><b>${v.name}</b><span>${v.sub}</span></figcaption><img src="${await f(pattern.replace("%", v.key))}" alt="${v.name}"></figure>`))).join("");
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>같은 장면, 세 가지 그림</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0b0b0f;color:#f2f2f5;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Pretendard Variable",Pretendard,"Apple SD Gothic Neo","Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:1160px;margin:0 auto;padding:52px 24px 96px}h1{font-size:32px;letter-spacing:-.035em;margin:0 0 8px}h2{font-size:21px;letter-spacing:-.02em;margin:64px 0 6px}
.sub,.look{color:#a1a1aa;margin:0 0 20px;max-width:780px}
figure{margin:0 0 22px;background:#16161c;border:1px solid #26262e;border-radius:18px;overflow:hidden}figure img{display:block;width:100%;height:auto;image-rendering:pixelated}
figcaption{padding:13px 18px;display:grid;gap:2px;border-bottom:1px solid #26262e}figcaption b{font-size:15px}figcaption span{color:#a1a1aa;font-size:13px}
table{border-collapse:collapse;width:100%;font-size:14px;background:#16161c;border-radius:14px;overflow:hidden}th,td{text-align:left;padding:9px 14px;border-bottom:1px solid #26262e;vertical-align:top}th{color:#a1a1aa;font-weight:500;font-size:12.5px}tr:last-child td{border-bottom:0}
</style><main>
<h1>같은 장면, 세 가지 그림</h1>
<p class="sub">예시 장면(기차역 앞 광장)의 그림 22종을 그린 주체만 바꿨다. 배치·조명·코드는 셋 다 똑같다. B 와 C 는 그림 모델을 쓰지 않고, 언어 모델이 "화소를 찍는 코드"를 써서 그린 것이다.</p>
${await sec("① 플레이 화면", "실제 게임 배율이다. 바닥이 얼마나 차분한지, 물건들이 한 그림체로 보이는지, 캐릭터가 또렷한지 볼 것.", "cmp-%-play.png", jpg)}
${await sec("② 장면 전체", "편집 화면에서 장면 전체를 본 것. 바닥 무늬의 반복이 보이는지, 건물이 눈길을 끄는지 볼 것.", "cmp-%-fit.png", jpg)}
${await sec("③ 그림 낱장 (4배 확대, 조명 없음)", "조명을 뺀 원본이다. 캐릭터 줄은 위에서부터 앞·뒤·옆, 칸은 서 있기와 걷기 네 장이다. A 의 걷기는 같은 그림을 흔든 것이고, B·C 는 다리와 팔이 실제로 움직인다.", "sheet-%.png", png)}
<h2>정리</h2>
<table><tr><th></th><th>A. Gemini</th><th>B. Fable 5.2 Medium</th><th>C. 세션의 Claude</th></tr>
<tr><td>그림체 일관성</td><td>장마다 세밀함과 크기가 들쭉날쭉</td><td>한 사람이 그린 듯 고르다</td><td>한 사람이 그린 듯 고르다</td></tr>
<tr><td>낱장의 세밀함</td><td>가장 풍부하다 (회화적)</td><td>단순하지만 읽힌다. 건물은 A 못지않다</td><td>B 와 비슷</td></tr>
<tr><td>바닥</td><td>72px 반복, 잔무늬 많음</td><td>144px, 차분하나 큰 얼룩이 반복됨</td><td>144px, 가장 차분함</td></tr>
<tr><td>걷기 동작</td><td>흔들기 (가짜)</td><td>진짜 4프레임</td><td>진짜 4프레임</td></tr>
<tr><td>22종 걸린 시간</td><td>2~3분 (분당 10장 제한)</td><td>100초 (6개씩 동시에)</td><td>대화하며 그린 것이라 비교 불가</td></tr>
<tr><td>실패·재시도</td><td>가끔 배경 제거·분할 실패</td><td>22/22 첫 시도 성공</td><td>—</td></tr>
<tr><td>고치기</td><td>다시 뽑는 수밖에 없음</td><td>코드라서 "지붕만 파랗게"가 됨</td><td>같음</td></tr></table>
<p class="look" style="margin-top:14px">한계: B·C 는 아직 Eastward 의 손그림 밀도에는 못 미친다. 다만 그림체가 하나로 모이고, 걷기가 진짜가 되고, 부분 수정이 가능해진다.</p>
</main></html>`;
writeFileSync(T + "age-draw.html", html);
console.log("bytes", html.length);
