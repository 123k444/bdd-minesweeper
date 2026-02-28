# 💣 Bdd의 지뢰찾기

클래식 지뢰찾기 게임 — 15×15 보드, 지뢰 40개  
Firebase Firestore를 이용한 **전 세계 실시간 스코어보드** 지원

---

## 🎮 플레이 방법

| 동작 | 설명 |
|---|---|
| **좌클릭** | 칸 열기 |
| **우클릭** | 깃발 꽂기 / 제거 |
| **상단 얼굴 버튼** | 새 게임 시작 |

- 첫 클릭 주변은 항상 안전합니다 (지뢰 없음)  
- 타이머는 첫 클릭 시 시작됩니다  
- 지뢰 없이 모든 칸을 열면 승리!

---

## 🌐 전 세계 실시간 스코어보드 설정 (Firebase)

> Firebase를 설정하지 않아도 게임은 정상 동작합니다 (로컬 저장 모드).  
> GitHub Pages 등으로 배포하여 전 세계 플레이어와 기록을 공유하려면 아래 단계를 따르세요.

### 1단계 — Firebase 프로젝트 생성

1. [Firebase 콘솔](https://console.firebase.google.com/) 에 접속
2. **"프로젝트 추가"** 클릭 → 프로젝트 이름 입력 → 생성
3. 좌측 메뉴에서 **Firestore Database** → **데이터베이스 만들기** 클릭
4. **프로덕션 모드**로 시작 → 원하는 리전 선택 (예: `asia-northeast3` = 서울)

### 2단계 — 웹 앱 등록 및 설정값 복사

1. Firebase 콘솔 홈 → **"</> 웹"** 버튼 클릭
2. 앱 닉네임 입력 (예: `minesweeper`) → 앱 등록
3. 아래와 같은 설정값이 표시됩니다:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

4. `game.js` 상단의 `FIREBASE_CONFIG` 객체에 위 값을 그대로 붙여넣습니다:

```js
// game.js 상단
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSy...",        // ← 여기에 붙여넣기
  authDomain:        "your-project.firebaseapp.com",
  projectId:         "your-project-id",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abcdef"
};
```

### 3단계 — Firestore 보안 규칙 설정

Firebase 콘솔 → Firestore Database → **규칙** 탭에서 아래 규칙을 붙여넣고 **게시**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /minesweeper_scores/{doc} {
      // 누구나 읽기 가능
      allow read: true;

      // 쓰기: 필수 필드 포함 + 값 범위 검증만 허용
      allow create: if
        request.resource.data.keys().hasAll(['name', 'time', 'date', 'timestamp'])
        && request.resource.data.name is string
        && request.resource.data.name.size() >= 1
        && request.resource.data.name.size() <= 20
        && request.resource.data.time is int
        && request.resource.data.time >= 0
        && request.resource.data.time <= 999;

      // 수정 및 삭제 불가 (기록 영구 보존)
      allow update, delete: false;
    }
  }
}
```

> ⚠️ 이 규칙은 점수 **수정/삭제를 완전히 차단**합니다.  
> 새 점수 추가만 가능하며, 악의적인 삭제로부터 스코어보드를 보호합니다.

---

## 🚀 GitHub Pages 배포

```bash
# 1. 저장소 생성 후 push
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_ID/YOUR_REPO.git
git push -u origin main

# 2. GitHub 저장소 → Settings → Pages
#    Source: Deploy from a branch → main → / (root) → Save
```

배포 후 `https://YOUR_ID.github.io/YOUR_REPO/` 에서 접속 가능합니다.  
Firebase 설정이 완료되어 있으면 접속한 모든 플레이어의 기록이 실시간으로 공유됩니다.

---

## 📁 파일 구조

```
📦 wfcr/
├── index.html    게임 HTML
├── style.css     레트로 스타일
├── game.js       게임 로직 + Firebase 연동
├── README.md     이 파일
└── imgs/
    ├── main.png  기본 표정 (스마일)
    ├── died.png  사망 표정
    ├── bomb.png  지뢰
    └── flag.png  깃발
```

---

## 🔧 Firebase 없이 실행

`game.js`의 `FIREBASE_CONFIG`를 수정하지 않으면 자동으로 **로컬 저장 모드**로 전환됩니다.  
스코어보드는 해당 브라우저에만 저장됩니다.
