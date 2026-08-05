# 잠실학생체육관 좌석 배치 · 단체석 지정

배구 경기용 좌석 배치도. 팀(단체)별 지정석 배정, 사석 관리, 시간대별 버전 기록을 지원합니다.

- **기본 화면(단체석 지정)**: ① 팀 선택/추가 → ② 도면에서 구역 클릭 → ③ 좌석 드래그 또는 석수 입력 → [이 팀 좌석으로 지정]
- **관리자 화면**: 사석 편집, 지정석 색·메모 수동 관리, 엑셀 내보내기, 저장/불러오기, 버전 기록(비밀번호)

## 데이터 저장 구조

여러 팀이 접속해 수정하면 `api/state.js`(Vercel 서버리스 함수)가 **이 저장소의 `data/state.json`에 커밋**으로 저장합니다.
- 커밋 이력 = 버전 기록: 저장할 때마다 "좌석 데이터: 3팀 · 지정석 129석 · 사석변경 0건" 같은 메시지로 커밋됨
- 관리자 화면 → 버전 기록에서 비밀번호 입력 후 커밋 목록 조회 · 특정 시점으로 복원 (비밀번호는 서버에서 검증)
- 앱은 수정 후 3초 디바운스로 저장하고, 15초 주기로 다른 사람의 변경을 받아옵니다

## 로컬에서 바로 실행 (서버 아무데나)

```bash
GH_TOKEN=깃허브토큰 GH_REPO=소유자/저장소 node server.js
# → http://localhost:3000
```

## 배포 (Vercel)

1. 이 저장소를 GitHub에 올리고 Vercel에 Import
2. GitHub에서 **Fine-grained Personal Access Token** 발급
   - Repository access: 이 저장소만
   - Permissions: **Contents → Read and write**
3. Vercel → Settings → Environment Variables 추가:

| 변수 | 값 |
|---|---|
| `GH_TOKEN` | 발급한 토큰 |
| `GH_REPO` | `소유자/저장소이름` 예) `mcfly0803/seatmap_repo` |
| `GH_BRANCH` | `main` (생략 가능) |
| `SEATMAP_HIST_PW` | 버전 기록 비밀번호 (생략 시 0429) |

4. 배포 완료 → 접속자 모두 같은 현황을 실시간 공유

> **주의**: 공개 저장소면 `data/state.json` 내용(팀명·좌석)도 공개됩니다. 민감하면 저장소를 Private으로 두세요 (토큰만 있으면 API는 동일하게 동작).
> GitHub Pages에만 올리면(서버 없이) 앱은 각자 브라우저 저장 모드로 동작합니다.

## API

| 요청 | 설명 |
|---|---|
| `GET /api/state` | 현재 공유 상태 (`data/state.json`) |
| `PUT /api/state` | 상태를 커밋으로 저장 |
| `GET /api/state?versions=1&pw=****` | 버전 목록(커밋 이력 최근 60개) |
| `GET /api/state?version=<커밋sha>&pw=****` | 특정 시점 전체 데이터 |
