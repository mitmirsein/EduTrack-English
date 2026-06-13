#!/usr/bin/env python3
import sys
import os
import re
import argparse
import tempfile
from pathlib import Path

def parse_markdown(md_content):
    lines = md_content.split('\n')
    title = ""
    meta = {}
    elements = []
    
    in_blockquote = False
    blockquote_lines = []
    current_question = None
    
    for line in lines:
        line_strip = line.strip()
        
        # 블록쿼트 (독해 지문 박스)
        if line_strip.startswith('>'):
            if not in_blockquote:
                in_blockquote = True
                blockquote_lines = []
            content = line_strip[1:].strip()
            blockquote_lines.append(content)
            continue
        else:
            if in_blockquote:
                in_blockquote = False
                elements.append({
                    'type': 'blockquote',
                    'content': '\n'.join(blockquote_lines)
                })
                blockquote_lines = []
        
        # 타이틀 파싱 (# )
        if line.startswith('# '):
            title = line[2:].strip()
            title = re.sub(r'^\[.*?\]\s*', '', title)
            continue
            
        # 메타데이터 파싱 (- **키**: 값)
        if line.startswith('- '):
            meta_match = re.match(r'^-\s*\*\*([^*]+)\*\*:\s*(.*)', line)
            if meta_match:
                key = meta_match.group(1).strip()
                val = meta_match.group(2).strip()
                meta[key] = val
                continue
                
        # 수평선 건너뛰기
        if line_strip == '---' or line_strip == '***':
            continue
            
        # 빈 라인 무시
        if not line_strip:
            continue
            
        # 섹션 헤더 (##)
        if line.startswith('## '):
            sec_title = line[3:].strip()
            elements.append({
                'type': 'section',
                'content': sec_title
            })
            current_question = None  # 섹션 시작 시 이전 문항 결합 해제
            continue
            
        # 문항 파싱 (숫자. 내용 또는 **숫자. 내용**)
        q_match = re.match(r'^(\*\*)?(\d+)\.\s*(.*)', line_strip)
        if q_match:
            q_num = q_match.group(2)
            q_text = q_match.group(3).strip()
            # '**N. 내용**' 형태(문항 전체 볼드)일 때만 끝의 ** 를 제거한다.
            # 'N. **내용**' 형태에서 끝의 * 를 일괄 제거하면 볼드 짝이 깨져
            # 시험지에 '**' 기호가 그대로 인쇄된다.
            if q_match.group(1) and q_text.endswith('**'):
                q_text = q_text[:-2].rstrip()
            current_question = {
                'type': 'question',
                'num': q_num,
                'body': [q_text],
                'choices': None,
                'answer': None
            }
            elements.append(current_question)
            continue
            
        # 정답 및 모범답안 파싱 (*정답: 또는 *답안:) - 보기 파싱보다 먼저 처리하여 오진단 방지
        if any(line_strip.startswith(prefix) for prefix in ['*정답:', '*답안:', '정답:', '답안:']):
            ans_match = re.match(r'^\*?(정답|답안):\s*(.*)\*?$', line_strip)
            if ans_match:
                ans_text = ans_match.group(2).rstrip('*').strip()
                if current_question:
                    current_question['answer'] = ans_text
                # current_question이 없으면 버린다 — text로 보존하면 학생용 시험지에 정답이 인쇄된다.
            continue
            
        # 보기 파싱 (① ~ ⑤ 포함) - 누적 방식으로 결합
        if any(char in line_strip for char in ['①', '②', '③', '④', '⑤']):
            if current_question:
                if current_question['choices']:
                    current_question['choices'] += " " + line_strip
                else:
                    current_question['choices'] = line_strip
            else:
                elements.append({
                    'type': 'text',
                    'content': line_strip
                })
            continue
            
        # 일반 본문 텍스트 (문항 설명/이미지 등)는 현재 작성 중인 문항 바디에 추가
        if current_question and not current_question['choices'] and not current_question['answer']:
            current_question['body'].append(line_strip)
        else:
            elements.append({
                'type': 'text',
                'content': line_strip
            })
        
    if in_blockquote:
        elements.append({
            'type': 'blockquote',
            'content': '\n'.join(blockquote_lines)
        })
        
    return title, meta, elements

def should_show_writing_lines(elem, mode='student'):
    if mode != 'student':
        return False
    if elem.get('choices'):
        return False
        
    body_texts = elem.get('body', [])
    full_body_text = " ".join(body_texts) if isinstance(body_texts, list) else str(body_texts)
    if '________' in full_body_text or '____' in full_body_text:
        return False
        
    answer = elem.get('answer', '')
    if answer:
        clean_ans = re.sub(r'[*_`]', '', answer).strip()
        if len(clean_ans.split()) <= 2:
            return False
            
    return True

def markdown_to_html(text, public_dir_path):
    # HTML 이스케이프
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    
    # 볼드 및 이탤릭 변환
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'\*([^*]+)\*', r'<em>\1</em>', text)

    # 짝이 맞지 않아 남은 굵게 기호는 시험 내용이 아니라 마크다운 잔여물이므로
    # 인쇄물에 노출되지 않도록 제거한다 (멀티라인 볼드 등 방어).
    text = text.replace('**', '')
    
    # 이미지 마크다운 변환 ![alt](url)
    def replace_img(match):
        alt = match.group(1)
        url = match.group(2)
        if url.startswith('/'):
            local_path = Path(public_dir_path) / url.lstrip('/')
            file_url = local_path.as_uri()
        else:
            local_path = Path(public_dir_path) / url
            file_url = local_path.as_uri()
        return f'<div class="exam-image-container"><img class="exam-image" src="{file_url}" alt="{alt}" /></div>'
        
    # HTML 이스케이프 이전에 ![&lt;... 이런 식으로 치환된 것 복원
    text = text.replace('&amp;!', '!').replace('&lt;', '<').replace('&gt;', '>')
    text = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', replace_img, text)
    
    # 빈칸 채우기 라인 기호 (___ 등)를 세련된 언더라인 스팬으로 변환
    text = re.sub(r'_{3,}', r'<span class="underline-blank"></span>', text)
    
    return text

def format_choices_html(choices_str, public_dir_path):
    tokens = re.split(r'(①|②|③|④|⑤)', choices_str)
    choices = []
    current_symbol = None
    for token in tokens:
        if token in ['①', '②', '③', '④', '⑤']:
            current_symbol = token
        elif current_symbol:
            content = token.strip()
            choices.append((current_symbol, content))
            current_symbol = None
            
    if not choices:
        return f'<div class="plain-text">{markdown_to_html(choices_str, public_dir_path)}</div>'
        
    total_len = sum(len(c[1]) for c in choices)
    
    # 총 길이에 따른 레이아웃 결정
    if total_len < 30:
        layout_class = "inline-choices"
    elif total_len < 65:
        layout_class = "two-column-choices"
    else:
        layout_class = "block-choices"
        
    html = [f'<div class="choices-container {layout_class}">']
    for sym, val in choices:
        val_html = markdown_to_html(val, public_dir_path)
        html.append(f'  <div class="choice-item"><span class="choice-symbol">{sym}</span><span class="choice-text">{val_html}</span></div>')
    html.append('</div>')
    return "\n".join(html)

def build_html_document(title, meta, elements, mode='student', public_dir_path=None):
    html = []
    html.append('<!DOCTYPE html>')
    html.append('<html lang="ko">')
    html.append('<head>')
    html.append('  <meta charset="UTF-8">')
    html.append(f'  <title>{title}</title>')
    html.append('  <link rel="preconnect" href="https://fonts.googleapis.com">')
    html.append('  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>')
    html.append('  <link href="https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&family=Noto+Serif+KR:wght@400;700&family=Noto+Sans+KR:wght@400;700&display=swap" rel="stylesheet">')
    
    html.append('  <style>')
    html.append('''
        @page {
            size: A4;
            margin: 12mm 12mm 12mm 12mm;
        }
        * {
            box-sizing: border-box;
        }
        body {
            font-family: 'Noto Sans KR', sans-serif;
            color: #1a1a1a;
            margin: 0;
            padding: 0;
            line-height: 1.5;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        
        /* 1단 타이틀 헤더 */
        .exam-header {
            width: 100%;
            margin-bottom: 22px;
            border-bottom: 1.5px solid #111827;
            padding-bottom: 10px;
        }
        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-bottom: 8px;
        }
        .brand-logo {
            font-size: 0.85rem;
            color: #4f46e5;
            font-weight: 700;
            letter-spacing: 0.03em;
        }
        .teacher-badge {
            background-color: #ef4444;
            color: #ffffff;
            font-size: 0.8rem;
            font-weight: 700;
            padding: 3px 9px;
            border-radius: 4px;
        }
        .student-info-table {
            border-collapse: collapse;
        }
        .student-info-table th, .student-info-table td {
            border: 1px solid #d1d5db;
            font-size: 0.78rem;
            padding: 3px 8px;
            text-align: center;
        }
        .student-info-table th {
            background-color: #f9fafb;
            font-weight: 700;
            color: #374151;
        }
        .exam-title-box {
            text-align: center;
            background-color: #fafafa;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 10px 18px;
        }
        .exam-title {
            font-family: 'Noto Serif KR', serif;
            font-size: 1.35rem;
            font-weight: 700;
            margin: 0 0 4px 0;
            color: #111827;
        }
        .exam-meta {
            font-size: 0.8rem;
            color: #6b7280;
            font-weight: 500;
        }
        .exam-meta-item:not(:last-child)::after {
            content: "  |  ";
            margin: 0 6px;
            color: #d1d5db;
        }
        
        /* 2단 본문 조판 */
        .exam-body {
            column-count: 2;
            column-gap: 26px;
            column-rule: 1px solid #e5e7eb;
        }
        
        /* 섹션 구분선 */
        .section-container {
            margin-top: 22px;
            margin-bottom: 10px;
            break-inside: avoid;
        }
        .section-title {
            font-family: 'Noto Serif KR', serif;
            font-size: 0.98rem;
            font-weight: 700;
            color: #111827;
            margin: 0 0 4px 0;
            border-bottom: 1.5px solid #374151;
            padding-bottom: 2px;
        }
        .section-desc {
            font-size: 0.82rem;
            color: #4b5563;
            margin-bottom: 8px;
            font-weight: 500;
        }
        
        /* 일반 지시문/텍스트 */
        .plain-text {
            font-size: 0.88rem;
            margin-top: 14px;
            margin-bottom: 6px;
            color: #374151;
        }
        
        /* 독해 지문 박스 */
        blockquote {
            background-color: #fafafa;
            border-left: 3px solid #4f46e5;
            padding: 8px 10px;
            margin: 12px 0;
            border-radius: 0 4px 4px 0;
            font-size: 0.85rem;
            line-height: 1.55;
            font-family: 'Noto Serif KR', serif;
            break-inside: avoid;
        }
        blockquote p {
            margin: 0;
        }
        blockquote p:not(:last-child) {
            margin-bottom: 4px;
        }
        
        /* 문제 블록 */
        .question-block {
            margin-bottom: 20px;
            break-inside: avoid;
        }
        .question-header {
            font-size: 0.88rem;
            line-height: 1.45;
            margin-bottom: 5px;
            display: flex;
            align-items: flex-start;
        }
        .question-num {
            font-weight: 700;
            margin-right: 5px;
            color: #111827;
            flex-shrink: 0;
        }
        .question-text {
            font-family: 'Noto Serif KR', serif;
            color: #1f2937;
        }
        
        /* 보기 */
        .choices-container {
            font-size: 0.85rem;
            color: #374151;
            margin-top: 4px;
            padding-left: 12px;
        }
        .choices-container.inline-choices {
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
        }
        .choices-container.two-column-choices {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px 8px;
        }
        .choices-container.block-choices {
            display: flex;
            flex-direction: column;
            gap: 3px;
        }
        .choice-item {
            display: flex;
            align-items: flex-start;
        }
        .choice-symbol {
            font-weight: 700;
            margin-right: 4px;
            color: #111827;
            flex-shrink: 0;
        }
        .choice-text {
            font-family: 'Noto Serif KR', serif;
        }
        
        /* 주관식 빈 필기선 */
        .writing-line {
            border-bottom: 1px dotted #9ca3af;
            height: 18px;
            margin-top: 6px;
            margin-bottom: 4px;
            width: 85%;
            margin-left: 12px;
        }
        
        /* 인라인 빈칸 밑줄 */
        .underline-blank {
            display: inline-block;
            width: 50px;
            border-bottom: 1px solid #1a1a1a;
            margin: 0 3px;
            vertical-align: bottom;
            height: 15px;
        }
        
        /* 교사용 채점 정답 스타일 */
        .answer-key {
            display: none;
        }
        body.teacher-mode .answer-key {
            display: block;
            color: #ef4444;
            font-family: 'Nanum Pen Script', cursive;
            font-size: 1.15rem;
            font-weight: 700;
            margin-top: 3px;
            padding-left: 12px;
        }
        
        /* 이미지 정렬 및 규격 */
        .exam-image-container {
            text-align: center;
            margin: 6px 0;
            width: 100%;
        }
        .exam-image {
            max-width: 85%;
            max-height: 110px;
            height: auto;
            object-fit: contain;
            border: 1px solid #e5e7eb;
            border-radius: 4px;
            background-color: #ffffff;
        }
    ''')
    html.append('  </style>')
    html.append('</head>')
    
    if mode == 'teacher':
        html.append('<body class="teacher-mode">')
    else:
        html.append('<body>')
        
    html.append('  <div class="exam-header">')
    html.append('    <div class="header-top">')
    html.append('      <div class="brand-logo">수학중독학원 영어과</div>')
    
    if mode == 'student':
        html.append('      <table class="student-info-table">')
        html.append('        <tr>')
        html.append('          <th>이 름</th>')
        html.append('          <td style="width: 80px;"></td>')
        html.append('          <th>점 수</th>')
        html.append('          <td style="width: 50px;"></td>')
        html.append('          <th>확 인</th>')
        html.append('          <td style="width: 50px;"></td>')
        html.append('        </tr>')
        html.append('      </table>')
    else:
        html.append('      <div class="teacher-badge">교사용 정답지</div>')
        
    html.append('    </div>')
    
    html.append('    <div class="exam-title-box">')
    html.append(f'      <h1 class="exam-title">{title}</h1>')
    
    meta_items = []
    if '평가 대상' in meta:
        meta_items.append(f'<span class="exam-meta-item">평가 대상: {meta["평가 대상"]}</span>')
    if '시험 시간' in meta:
        meta_items.append(f'<span class="exam-meta-item">시험 시간: {meta["시험 시간"]}</span>')
    if '총 배점' in meta:
        meta_items.append(f'<span class="exam-meta-item">총 배점: {meta["총 배점"]}</span>')
        
    if meta_items:
        html.append('      <div class="exam-meta">')
        html.append('        ' + ''.join(meta_items))
        html.append('      </div>')
        
    html.append('    </div>')
    html.append('  </div>')
    
    html.append('  <div class="exam-body">')
    
    for i, elem in enumerate(elements):
        if elem['type'] == 'section':
            html.append('    <div class="section-container">')
            html.append(f'      <h2 class="section-title">{elem["content"]}</h2>')
            if i + 1 < len(elements) and elements[i+1]['type'] == 'text':
                next_elem = elements[i+1]
                if next_elem['content'].startswith('**') and next_elem['content'].endswith('**'):
                    desc_text = next_elem['content'].strip('*')
                    html.append(f'      <div class="section-desc">{desc_text}</div>')
            html.append('    </div>')
            
        elif elem['type'] == 'text':
            if i > 0 and elements[i-1]['type'] == 'section' and elem['content'].startswith('**') and elem['content'].endswith('**'):
                continue
            text_html = markdown_to_html(elem['content'], public_dir_path)
            html.append(f'    <div class="plain-text">{text_html}</div>')
            
        elif elem['type'] == 'blockquote':
            bq_lines = elem['content'].split('\n')
            bq_html_lines = []
            for bq_line in bq_lines:
                if bq_line.strip():
                    bq_html_lines.append(f'<p>{markdown_to_html(bq_line, public_dir_path)}</p>')
            html.append('    <blockquote>')
            html.append('      ' + '\n      '.join(bq_html_lines))
            html.append('    </blockquote>')
            
        elif elem['type'] == 'question':
            html.append('    <div class="question-block">')
            html.append('      <div class="question-header">')
            html.append(f'        <span class="question-num">{elem["num"]}.</span>')
            
            first_text = elem['body'][0] if elem['body'] else ""
            first_html = markdown_to_html(first_text, public_dir_path)
            html.append(f'        <span class="question-text">{first_html}</span>')
            html.append('      </div>')
            
            if len(elem['body']) > 1:
                html.append('      <div class="question-sub-body" style="padding-left: 12px; margin-top: 4px; font-size: 0.85rem; color: #1f2937;">')
                for b_text in elem['body'][1:]:
                    sub_html = markdown_to_html(b_text, public_dir_path)
                    html.append(f'        <div class="question-sub-line" style="margin: 3px 0;">{sub_html}</div>')
                html.append('      </div>')
            
            if elem['choices']:
                choices_html = format_choices_html(elem['choices'], public_dir_path)
                html.append(f'      {choices_html}')
                
            if should_show_writing_lines(elem, mode):
                html.append('      <div class="writing-line"></div>')
                html.append('      <div class="writing-line"></div>')
            
            if mode == 'teacher':
                if elem['answer']:
                    html.append(f'      <div class="answer-key">정답: {markdown_to_html(elem["answer"], public_dir_path)}</div>')
                    
            html.append('    </div>')
            
    html.append('  </div>')
    html.append('</body>')
    html.append('</html>')
    
    return "\n".join(html)

def compile_to_pdf(input_md_path: Path, output_pdf_path: Path, mode='student'):
    success = False
    if not input_md_path.exists():
        print(f"Error: {input_md_path} does not exist.")
        return False
        
    content = input_md_path.read_text(encoding='utf-8')
    title, meta, elements = parse_markdown(content)
    
    # 프로젝트 public 폴더 경로 탐색
    project_root = input_md_path.resolve().parents[1]
    public_dir = project_root / "public"
    
    html_content = build_html_document(title, meta, elements, mode=mode, public_dir_path=public_dir)
    
    stem = f"temp_{input_md_path.stem}_{mode}"
    temp_dir = Path(tempfile.gettempdir())
    temp_html = temp_dir / f"{stem}.html"
    temp_html.write_text(html_content, encoding='utf-8')
    
    from playwright.sync_api import sync_playwright
    
    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch(headless=True)
            except Exception:
                # playwright 관리 chromium이 설치되지 않은 머신에서는 시스템 Chrome으로 폴백
                browser = p.chromium.launch(channel='chrome', headless=True)
            page = browser.new_page()
            page.goto(temp_html.as_uri())
            
            # 웹 폰트 로드 완료 대기
            page.evaluate("document.fonts.ready")
            
            output_pdf_path.parent.mkdir(parents=True, exist_ok=True)
            
            page.pdf(
                path=str(output_pdf_path),
                format="A4",
                print_background=True,
                margin={"top": "0mm", "bottom": "0mm", "left": "0mm", "right": "0mm"}
            )
            
            browser.close()
            print(f"✅ Success: {output_pdf_path.name} created via Playwright.")
            success = True
            
    except Exception as e:
        print(f"❌ Playwright PDF compile failed for {input_md_path.name} ({mode} mode):")
        print(e)
        success = False
    finally:
        if success and temp_html.exists():
            try:
                temp_html.unlink()
            except Exception:
                pass
                
    return success

def main():
    parser = argparse.ArgumentParser(description="English Exam PDF Compiler — Custom HTML & Playwright 2-column layout converter.")
    parser.add_argument("input", nargs="?", help="Markdown file to compile.")
    parser.add_argument("--all", action="store_true", help="Compile all markdown files in the level_test directory.")
    
    args = parser.parse_args()
    
    # 타겟 리소스 디렉토리 설정 (level_test)
    project_root = Path(__file__).resolve().parents[1]
    resource_dir = project_root / "level_test"
    
    if args.all:
        md_files = list(resource_dir.glob("*.md"))
        if not md_files:
            print("No markdown files found in level_test directory.")
            sys.exit(1)
            
        print(f"Found {len(md_files)} markdown files in level_test. Compiling both student & teacher PDFs...")
        for md_file in md_files:
            pdf_student = resource_dir / f"{md_file.stem}_student.pdf"
            pdf_teacher = resource_dir / f"{md_file.stem}_teacher.pdf"
            
            compile_to_pdf(md_file, pdf_student, mode='student')
            compile_to_pdf(md_file, pdf_teacher, mode='teacher')
            
        print("All compilations completed.")
        sys.exit(0)
        
    if not args.input:
        parser.print_help()
        sys.exit(1)
        
    input_path = Path(args.input)
    if not input_path.is_absolute():
        input_path = resource_dir / input_path
        
    pdf_student = input_path.parent / f"{input_path.stem}_student.pdf"
    pdf_teacher = input_path.parent / f"{input_path.stem}_teacher.pdf"
    
    compile_to_pdf(input_path, pdf_student, mode='student')
    compile_to_pdf(input_path, pdf_teacher, mode='teacher')

if __name__ == "__main__":
    main()
