# 0단계 스파이크 비교 페이지를 자체완결 HTML 한 장으로 만든다.
import base64, io, json, sys
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else "spike/out/age-spike.html"


def uri(path, max_w=1400, fmt=None):
    im = Image.open(path)
    if im.size[0] > max_w:
        im = im.resize((max_w, round(im.size[1] * max_w / im.size[0])), Image.NEAREST if path.endswith(".png") else Image.LANCZOS)
    buf = io.BytesIO()
    fmt = fmt or ("PNG" if path.endswith(".png") else "JPEG")
    if fmt == "JPEG":
        im.convert("RGB").save(buf, "JPEG", quality=84)
    else:
        im.save(buf, "PNG", optimize=True)
    return f"data:image/{fmt.lower()};base64,{base64.b64encode(buf.getvalue()).decode()}"


def fig(path, cap, max_w=1400):
    return f'<figure><img src="{uri(path, max_w)}" alt=""><figcaption>{cap}</figcaption></figure>'


b_usage = json.load(open("spike/out/b-claude-opus-5-5/usage.json"))
b_ms = sum(v["ms"] for v in b_usage.values()) / len(b_usage) / 1000
b_out = sum(v["out"] for v in b_usage.values())

html = f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>0단계 에셋 스파이크 결과</title>
<style>
:root {{ color-scheme: dark; }}
body {{ margin: 0; background: #101116; color: #e8e6ef; font: 16px/1.6 -apple-system, "Pretendard", "Segoe UI", sans-serif; }}
main {{ max-width: 1180px; margin: 0 auto; padding: 48px 24px 96px; }}
h1 {{ font-size: 30px; margin: 0 0 8px; letter-spacing: -0.02em; }}
h2 {{ font-size: 21px; margin: 56px 0 12px; letter-spacing: -0.01em; }}
p, li {{ color: #c9c6d6; }}
.lead {{ font-size: 18px; color: #e8e6ef; }}
figure {{ margin: 16px 0; }}
img {{ width: 100%; border-radius: 10px; image-rendering: pixelated; display: block; }}
figcaption {{ font-size: 14px; color: #9a97aa; margin-top: 8px; }}
.two {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
table {{ border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 15px; }}
th, td {{ text-align: left; padding: 10px 12px; border-bottom: 1px solid #2a2b36; vertical-align: top; }}
th {{ color: #9a97aa; font-weight: 500; }}
.ok {{ color: #7fd6a0; }} .no {{ color: #f08a8a; }} .mid {{ color: #e8c26a; }}
.pick {{ background: #1b1d28; border: 1px solid #2f3245; border-radius: 12px; padding: 18px 22px; }}
@media (max-width: 800px) {{ .two {{ grid-template-columns: 1fr; }} }}
</style></head><body><main>
<h1>0단계 에셋 스파이크 결과</h1>
<p class="lead">한 장면 분량(바닥 재질 3, 소품 8, 건물 2, 캐릭터 4)을 세 가지 방식으로 뽑아 비교했습니다. 아래 장면이 고른 방식의 결과입니다.</p>

<div class="pick"><b>고른 방식: (가) 이미지 모델 + 결정적 후처리.</b>
글로만 요청해 그림을 받고, 배경 제거 → 팔레트 맞춤 축소 → 윤곽선 다시 긋기를 코드로 처리합니다. 건물은 통그림 한 장, 캐릭터는 세 방향 그림 한 장에서 걷기 프레임을 코드로 만듭니다. 사용자가 자리에 없어 판정은 제가 했습니다. 다르게 정하고 싶으시면 아래 그림을 보고 알려 주세요.</div>

<h2>1. 조명을 얹은 장면 (Phaser 4)</h2>
<div class="two">
{fig("spike/out/scene-lit.png", "조명·그림자·후처리를 켠 장면. 가로등과 자판기가 광원입니다.")}
{fig("spike/out/scene-flat.png", "같은 장면에서 조명만 끈 것. 바닥 가장자리(흙↔풀)는 코드가 만들었습니다.")}
</div>

<h2>2. 방식별 결과</h2>
{fig("spike/out/a-r2/_sheet.png", "(가) 이미지 모델 + 후처리. 한 벌 17장.")}
<div class="two">
{fig("spike/out/b-claude-opus-5-5/_sheet.png", "(나) 언어 모델이 화소 격자를 직접 쓰는 방식. 깔끔하지만 단순하고, 큰 그림(집)은 줄 길이가 틀어졌습니다.")}
{fig("spike/out/a-r3/_sheet.png", "(다) (가)에 스타일 기준 그림을 붙인 것. 가로등과 자판기에 기준 그림의 가게가 딸려 들어왔습니다.")}
</div>
<table>
<tr><th>기준</th><th>(가) 이미지 모델 + 후처리</th><th>(나) 격자 직접 쓰기</th><th>(다) 기준 그림 조건</th></tr>
<tr><td>팔레트·화소 밀도·시점 일치</td><td class="ok">통과. 같은 팔레트와 축척으로 맞춥니다. 시점은 프롬프트로 정면 고정.</td><td class="ok">통과</td><td class="mid">스타일은 더 닮지만 대상이 섞임</td></tr>
<tr><td>바닥 이음새</td><td class="ok">보이지 않음. 큰 얼룩은 걷어내 반복도 눈에 덜 띕니다.</td><td class="mid">한 재질만 시험</td><td>—</td></tr>
<tr><td>걷기 애니메이션</td><td class="ok">코드로 만든 프레임은 몸통이 그대로라 깜빡임이 없습니다.</td><td>—</td><td>—</td></tr>
<tr><td>3회 중 2회 이상 쓸 만한가</td><td class="ok">같은 요청 3회 모두 17장 전부 쓸 만했습니다.</td><td class="no">5장 중 집 1장 실패</td><td class="no">8개 소품 중 2개에 기준 그림이 섞임</td></tr>
<tr><td>한 장면 5분 이내</td><td class="ok">104~116초 (분당 10장 제한에 맞춘 속도)</td><td class="no">장당 평균 {b_ms:.0f}초, 집 한 채 120초</td><td>(가)와 같음</td></tr>
<tr><td>비용</td><td>장당 출력 약 1,500토큰. 한 장면 17장 ≈ 2.6만 토큰.</td><td>5장에 출력 {b_out:,}토큰 (Opus 5.5)</td><td>(가)와 같음</td></tr>
</table>
<p>비용의 금액 환산은 하지 않았습니다. 지금 쓰는 프록시가 이미지 모델 단가를 알려 주지 않아서, 측정한 토큰 수만 적었습니다.</p>

<h2>3. 같은 요청을 세 번 돌린 결과</h2>
<p>디자인은 매번 다르지만 그림체와 쓸 만한 정도는 일정했습니다.</p>
{fig("spike/out/a-r4/_sheet.png", "두 번째 실행")}
{fig("spike/out/a-r5/_sheet.png", "세 번째 실행. 집이 살짝 비스듬하게 나온 것이 유일한 흠입니다.")}

<h2>4. 걷기 애니메이션</h2>
<div class="two">
{fig("spike/out/walk/_proc.png", "코드로 만든 프레임 (채택). 세 방향 그림에서 다리만 번갈아 들고 몸통을 한 화소 내립니다.")}
{fig("spike/out/walk/_gen.jpg", "이미지 모델이 그린 걷기 시트. 팔 흔들림까지 있어 더 풍부하지만 방향마다 디자인이 달라질 위험이 있고 캐릭터당 3장이 더 듭니다. 다음 버전 후보로 남깁니다.")}
</div>

<h2>5. 건물: 통그림과 부품 조립</h2>
<div class="two">
{fig("spike/out/a-r4_x_kit_small.jpg", "부품 시트. 칸 크기가 고르지 않고 좌우 이음이 맞지 않아 조립하려면 손질이 필요합니다.")}
<div><p>통그림은 세 번 모두 바로 쓸 수 있었습니다(위 2·3번의 집과 가게). 부품 조립은 크기를 자유롭게 바꿀 수 있다는 장점이 있지만 지금 품질로는 이음새를 맞추는 데 추가 작업이 듭니다.</p><p><b>v1 은 통그림으로 갑니다.</b></p></div>
</div>

<h2>6. 이 결과로 정한 것</h2>
<ul>
<li>타일 한 칸 24화소, 화면 640×360 기준. 처음 계획한 16화소보다 생성 그림의 디테일이 잘 살아납니다.</li>
<li>Phaser 4.2.1. 조명은 주변광 + 점광원을 곱하기로 얹고, 빛 번짐·블룸·비네트를 더합니다. 그림자는 스프라이트 윤곽을 기울여 만듭니다.</li>
<li>이미지 모델은 분당 10장 안팎에서 한도에 걸립니다. 생성기는 이 속도에 맞춰 줄을 세우고, 걸리면 기다렸다 다시 시도합니다.</li>
<li>다리 없는 생물(슬라임 등)은 한 방향 그림만 받고 좌우 반전과 통통 튀는 프레임을 씁니다.</li>
</ul>
</main></body></html>"""

open(OUT, "w", encoding="utf-8").write(html)
print(OUT, round(len(html) / 1e6, 2), "MB")
