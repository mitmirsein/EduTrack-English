#!/usr/bin/env python3
"""성취도 시험지(md) 콘텐츠 자동 검사.

학생·학부모에게 인쇄되어 나가는 자료이므로, 변환(convert_appendix.py) 전에
다음 결함을 기계적으로 걸러낸다:

  1. 깨진 토큰        : <ctrl..>, U+FFFD(�) 등 LLM 생성 잔재
  2. 보기 기호 누락    : ①②④ 처럼 중간 번호가 빠진 선택지
  3. 빈칸 문항 결함    : "빈칸에 들어갈" 지시문 아래 문항에 ________ 가 없음
  4. 정답 누락        : 문항에 *정답:/*답안: 표기가 없음
  5. Set A/B 중복     : 동일 레벨 두 세트 간 완전히 같은 문항 (정보성 리포트)
  6. 편집 메모 잔존    : "(…교체)", TODO 등 작업 메모가 시험지에 남아 인쇄됨
  7. 정답 마킹 누출    : 일부 선택지에만 밑줄/볼드 → 학생용에서 정답이 표시됨
  8. 볼드 짝 깨짐      : 한 줄에 ** 가 홀수 개 → 시험지에 ** 기호 그대로 노출

검사 1~5는 appendix_test/md + achievement_test/md(시험지)에,
누출 검사 6~8은 level_test 까지 포함한 전체 시험지 md에 적용한다.

사용법: python3 agents/validate_exams.py
종료 코드: 결함 발견 시 1, 모두 통과 시 0. (5번 중복은 경고만)
"""
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
MD_DIR = PROJECT_ROOT / "appendix_test" / "md"
LEAK_SCAN_DIRS = [
    PROJECT_ROOT / "appendix_test" / "md",
    PROJECT_ROOT / "achievement_test" / "md",
    PROJECT_ROOT / "level_test",
]
CHOICE_SYMBOLS = "①②③④⑤"

QUESTION_RE = re.compile(r"^(\d+)\.\s+(.*)")
ANSWER_RE = re.compile(r"^\s*\*?(정답|답안):")
BROKEN_TOKEN_RE = re.compile(r"<ctrl\d*>|�")
BLANK_DIRECTIVE_RE = re.compile(r"\[(\d+)-(\d+)\].*빈칸에 들어갈")
# 편집 메모: "*(…교체)*" 형태의 독립 주석 줄 또는 TODO/FIXME
EDIT_NOTE_RE = re.compile(r"^\*?\(.*(교체|수정 필요|보류)\)\*?$|TODO|FIXME")
CHOICE_LINE_RE = re.compile(r"^[①②③④⑤]")


def parse_questions(lines):
    """문항 번호 → {text, body_lines, line_no} 매핑."""
    questions = {}
    current = None
    for i, line in enumerate(lines, start=1):
        m = QUESTION_RE.match(line.strip())
        # 보기/정답 줄이 아닌 "N. 문항" 줄만 새 문항으로 인식
        if m and not line.startswith(" "):
            current = int(m.group(1))
            questions[current] = {"text": m.group(2), "lines": [line], "line_no": i}
        elif current is not None:
            questions[current]["lines"].append(line)
    return questions


def check_file(path):
    errors = []
    content = path.read_text(encoding="utf-8")
    lines = content.split("\n")

    # 1. 깨진 토큰
    for i, line in enumerate(lines, start=1):
        if BROKEN_TOKEN_RE.search(line):
            errors.append(f"{path.name}:{i} 깨진 토큰 발견: {line.strip()[:60]}")

    questions = parse_questions(lines)

    # 빈칸 지시문이 적용되는 문항 번호 수집
    blank_required = set()
    for line in lines:
        m = BLANK_DIRECTIVE_RE.search(line)
        if m:
            blank_required.update(range(int(m.group(1)), int(m.group(2)) + 1))

    for num, q in sorted(questions.items()):
        body = "\n".join(q["lines"])

        # 2. 보기 기호 연속성 (보기가 있는 문항만)
        found = [s for s in CHOICE_SYMBOLS if s in body]
        if found:
            expected = list(CHOICE_SYMBOLS[: CHOICE_SYMBOLS.index(found[-1]) + 1])
            missing = [s for s in expected if s not in found]
            if missing:
                errors.append(
                    f"{path.name}:{q['line_no']} {num}번 문항 보기 기호 누락: {' '.join(missing)}"
                )

        # 3. 빈칸 지시문 적용 문항에 빈칸 부재
        if num in blank_required and "____" not in body:
            errors.append(
                f"{path.name}:{q['line_no']} {num}번 문항: 빈칸 유형인데 '________'가 없음"
            )

        # 4. 정답 누락
        if not any(ANSWER_RE.match(l.strip()) for l in q["lines"]):
            errors.append(f"{path.name}:{q['line_no']} {num}번 문항: 정답/답안 표기 없음")

    return errors, questions


def check_leaks(path):
    """검사 6~8: 인쇄물 누출 결함 (편집 메모, 정답 마킹, 깨진 볼드)."""
    errors = []
    lines = path.read_text(encoding="utf-8").split("\n")

    for i, line in enumerate(lines, start=1):
        s = line.strip()
        # 6. 편집 메모 잔존
        if EDIT_NOTE_RE.search(s):
            errors.append(f"{path.name}:{i} 편집 메모 잔존(시험지에 인쇄됨): {s[:60]}")
        # 8. 볼드 짝 깨짐 (한 줄에 ** 홀수 개)
        if s.count("**") % 2 == 1:
            errors.append(f"{path.name}:{i} ** 짝이 맞지 않음(기호 노출 위험): {s[:60]}")

    # 7. 정답 마킹 누출: 한 문항의 선택지 줄 중 일부에만 밑줄/볼드 마킹
    questions = parse_questions(lines)
    for num, q in sorted(questions.items()):
        choice_lines = [l.strip() for l in q["lines"] if CHOICE_LINE_RE.match(l.strip())]
        if len(choice_lines) < 3:
            continue
        marked = [l for l in choice_lines if "<u>" in l or "**" in l]
        if 0 < len(marked) < len(choice_lines):
            errors.append(
                f"{path.name}:{q['line_no']} {num}번 문항: 선택지 {len(choice_lines)}개 중 "
                f"{len(marked)}개에만 밑줄/볼드 마킹 → 학생용 시험지에 정답이 표시될 수 있음"
            )
    return errors


def normalize(text):
    return re.sub(r"\s+", " ", text).strip().lower()


def main():
    md_files = sorted(MD_DIR.glob("*.md"))
    if not md_files:
        print(f"오류: {MD_DIR} 에 md 파일이 없습니다.")
        return 1

    all_errors = []
    parsed = {}
    for path in md_files:
        errors, questions = check_file(path)
        all_errors.extend(errors)
        parsed[path.stem] = questions

    # 성취도 시험지도 기본 검사(1~4) 대상에 포함 (매핑 스펙 문서는 제외)
    ach_dir = PROJECT_ROOT / "achievement_test" / "md"
    for path in sorted(ach_dir.glob("*.md")):
        if "spec" in path.stem:
            continue
        errors, _ = check_file(path)
        all_errors.extend(errors)

    # 누출 검사(6~8): level_test 포함 전체 시험지
    for d in LEAK_SCAN_DIRS:
        for path in sorted(d.glob("*.md")):
            if "spec" in path.stem:
                continue
            all_errors.extend(check_leaks(path))

    # 5. Set A/B 간 동일 문항 리포트 (정보성)
    print("=== Set A/B 동일 문항 리포트 (재시험 변별력 참고용) ===")
    stems = sorted({name.rsplit("_set_", 1)[0] for name in parsed if "_set_" in name})
    for stem in stems:
        qa = parsed.get(f"{stem}_set_a", {})
        qb = parsed.get(f"{stem}_set_b", {})
        if not qa or not qb:
            continue
        texts_b = {normalize(q["text"]) for q in qb.values() if len(q["text"]) > 15}
        dup = [n for n, q in sorted(qa.items())
               if len(q["text"]) > 15 and normalize(q["text"]) in texts_b]
        print(f"  {stem}: {len(dup)}문항 동일 {dup if dup else ''}")

    print()
    if all_errors:
        print(f"=== ❌ 결함 {len(all_errors)}건 발견 ===")
        for e in all_errors:
            print(f"  {e}")
        return 1

    total = sum(len(q) for q in parsed.values())
    print(f"=== ✅ 통과: {len(md_files)}개 시험지, 총 {total}문항 검사 완료 (결함 0건) ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
