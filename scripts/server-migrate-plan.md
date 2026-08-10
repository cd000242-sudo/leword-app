# 서버 축소 이전 절차 (월 $52 → $12~24)

서버가 하던 일 중 방문자 관련은 전부 GitHub Pages + 15분 크론으로 옮겼다.
서버에 남은 것은 **황금보드 워커 + 관리자 API** 둘뿐이라 소형 인스턴스로 충분하다.

## 0. 사전 확인 (이전 전)

```bash
# 남은 워크로드 = 컨테이너 2개
docker ps --format '{{.Names}} {{.Status}}'
# 실제 메모리 사용량 — 이 값이 새 플랜 선택 근거
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}'
```

메모리 합계가 1.5GB 미만이면 2GB($12), 그 이상이면 4GB($24).
**측정 없이 2GB 로 내리지 말 것** — 워커가 OOM 으로 죽으면 보드가 멈춘다.

## 1. 신규 인스턴스 생성 (Vultr 콘솔)

Vultr 는 플랜 축소가 안 되므로 새로 만들어야 한다.

- Region: 기존과 동일 (Seoul)
- Image: Ubuntu 24.04 LTS
- Plan: Regular Cloud Compute 2GB 또는 4GB
- SSH Key: 기존 `leword_prod_ed25519` 등록
- **자동 백업 끄기** (+20% 절감). 배포 전 수동 스냅샷으로 대체한다.

생성 후 새 IP 를 확보한다.

## 2. 데이터 이전

기존 서버가 살아 있으면 볼륨을 그대로 옮긴다. 안 살아 있으면 3-b 로.

```bash
# (a) 기존 서버가 살아있는 경우 — /golden 볼륨 복사
OLD=141.164.59.17
NEW=<새IP>
ssh -i ~/.ssh/leword_prod_ed25519 root@$OLD \
  "docker run --rm -v api_leword-live-golden-data:/d -v /root:/b alpine tar czf /b/golden.tgz -C /d ."
scp -i ~/.ssh/leword_prod_ed25519 root@$OLD:/root/golden.tgz /tmp/
scp -i ~/.ssh/leword_prod_ed25519 /tmp/golden.tgz root@$NEW:/root/
```

`/quota`(SearchAd·OpenAPI 쿼터 상태)와 `/searchad`(계정)도 같은 방식으로 옮긴다.
**쿼터 상태를 안 옮기면 하루치 쿼터를 새로 소모**하므로 반드시 포함할 것.

## 3. 배포

```bash
# (a) 배포 스크립트 복사 후 실행
scp -i ~/.ssh/leword_prod_ed25519 root@$OLD:/root/deploy-d4a2bd20.sh root@$NEW:/root/  # 구서버 생존 시
ssh -i ~/.ssh/leword_prod_ed25519 root@$NEW "sh /root/deploy-d4a2bd20.sh <최신 커밋 SHA>"

# (b) 데이터 없이 새로 시작하는 경우 — 워커가 몇 시간에 걸쳐 보드를 재구축한다
#     보드가 0 에서 시작하므로 사용자에게 미리 알릴 것
```

`.env.production` 에 반드시 넣을 것:

```
WELFARE_API_KEY=<URL 인코딩된 형태 그대로. 디코딩 금지>
ANTHROPIC_API_KEY=<기존 값>
NAVER_* / SEARCHAD_* <기존 값>
```

## 4. 검증 (이 단계 없이 구서버 삭제 금지)

```bash
# 로컬에서
LEWORD_SERVER_BASE=https://<새IP>.sslip.io npm run health:harness
```

17개 체크가 **server 7종 전부 PASS** 여야 한다. 하나라도 FAIL 이면 구서버를 남긴 채 원인부터 잡는다.

추가로:
- 워커 하트비트 `boardCount` 가 증가하는지 30분 관찰
- `leaderspro.kr` 홈에서 공지·브리핑·다운로드 스냅샷이 다시 채워지는지
  (크론이 서버 미러에 성공해야 `home-notices.json` 등이 생성된다)

## 5. 전환

1. SPA 의 `LEWORD_API_BASE`(`spa/src/lib/siteOps.ts`, `spa/src/pages/IndexPage.tsx`,
   `spa/src/pages/DownloadPage.tsx`)를 새 IP 로 교체 → 커밋 → Pages 배포
2. GitHub Actions 변수 `LEWORD_API_BASE` 도 새 IP 로 갱신
3. 24시간 관찰 후 구 인스턴스 삭제 — **여기서 $52 과금이 끊긴다**

## 주의

- 구서버를 먼저 지우면 볼륨 복구가 불가능하다. 반드시 검증 후 삭제.
- `sslip.io` 도메인은 IP 가 바뀌면 주소도 바뀐다(`<새IP>.sslip.io`).
- 크론이 15분마다 도니, 서버 주소 교체 후 첫 성공까지 최대 15분 걸린다.
