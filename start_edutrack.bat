@echo off
:: UTF-8 출력 전환 (한국어 Windows cmd 기본 CP949에서 한글 깨짐 방지)
chcp 65001 >nul
title EduTrack English - 로컬 웹 서비스 구동기
echo ==========================================================
echo  EduTrack English - 학생 관리 시스템
echo ==========================================================
echo.

:: 배치 파일이 위치한 디렉토리로 이동 (윈도우 11 호환)
cd /d "%~dp0"

:: 1. Node.js 설치 여부 가볍게 검증
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [오류] 컴퓨터에 Node.js가 설치되어 있지 않습니다.
    echo.
    echo  설치 방법 1: https://nodejs.org 에서 LTS 버전을 내려받아 설치
    echo  설치 방법 2: 명령 프롬프트에 아래 한 줄을 입력 ^(윈도우 11^)
    echo               winget install OpenJS.NodeJS.LTS
    echo.
    echo  설치를 마친 뒤 이 파일을 다시 더블클릭해 주세요.
    echo.
    pause
    exit /b 1
)

:: 2. 패키지 설치 여부 확인 후 자동 install
if not exist node_modules (
    echo [안내] 최초 실행 감지: 필요한 라이브러리 패키지를 로컬에 설치합니다.
    echo        ^(이 작업은 최초 1회만 수행되며, 최대 1~2분이 소요될 수 있습니다.^)
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [오류] 패키지 설치에 실패했습니다.
        echo  - 인터넷 연결을 확인한 뒤 이 파일을 다시 실행해 주세요.
        echo  - 계속 실패하면 이 검은 창의 위쪽 오류 메시지를 사진으로 찍어 문의해 주세요.
        echo.
        pause
        exit /b 1
    )
)

:: 3. Vite 개발 서버 실행 및 브라우저 자동 오픈 (--open 옵션 주입)
echo.
echo [안내] 로컬 웹 서버를 구동하고 관리자 화면을 실행합니다...
echo [안내] 서버를 종료하시려면 이 검은색 창을 닫으시면 됩니다.
echo ==========================================================
echo.

call npm run dev -- --open

pause
