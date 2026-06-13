#!/bin/bash
# EduTrack English — macOS 실행기 (start_edutrack.bat의 Mac 버전)
# Finder에서 더블클릭하면 터미널에서 실행됩니다.
# 최초 1회: 우클릭 → "열기"로 Gatekeeper 경고를 통과시키세요.

cd "$(dirname "$0")" || exit 1

echo "=========================================================="
echo " EduTrack English — 학생 관리 시스템 (macOS)"
echo "=========================================================="
echo

# 1. Node.js 설치 확인
if ! command -v node >/dev/null 2>&1; then
  echo "[오류] 이 컴퓨터에 Node.js가 설치되어 있지 않습니다."
  echo
  echo "  설치 방법 1: https://nodejs.org 에서 LTS 버전을 내려받아 설치"
  echo "  설치 방법 2: 터미널에 'brew install node' (Homebrew 사용 시)"
  echo
  echo "  설치를 마친 뒤 이 파일을 다시 더블클릭해 주세요."
  echo
  read -n 1 -s -r -p "아무 키나 누르면 창이 닫힙니다..."
  exit 1
fi

# 2. 최초 실행 시 패키지 자동 설치
if [ ! -d node_modules ]; then
  echo "[안내] 최초 실행 감지: 필요한 라이브러리를 설치합니다 (1~2분 소요)."
  echo
  if ! npm install; then
    echo
    echo "[오류] 패키지 설치에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행해 주세요."
    read -n 1 -s -r -p "아무 키나 누르면 창이 닫힙니다..."
    exit 1
  fi
fi

# 3. 로컬 서버 구동 + 브라우저 자동 오픈 (포트 5175 고정)
echo
echo "[안내] 로컬 웹 서버를 구동하고 관리자 화면을 엽니다 (http://localhost:5175)..."
echo "[안내] 종료하려면 이 터미널 창을 닫으시면 됩니다."
echo "=========================================================="
echo

npm run dev -- --open
