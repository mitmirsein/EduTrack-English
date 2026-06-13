#!/usr/bin/env python3
import sys
import os
import re
import argparse
import subprocess
import tempfile
from pathlib import Path

BRAND = os.environ.get('EDUTRACK_BRAND', 'EduTrack English')

def parse_report_markdown(md_content):
    lines = md_content.split('\n')
    title = ""
    meta = {}
    table_rows = []
    sections = []
    
    current_section = None
    in_table = False
    
    for line in lines:
        line_strip = line.strip()
        
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
                
        # 수평선
        if line_strip == '---' or line_strip == '***':
            continue
            
        # 표 감지 및 추출
        if line_strip.startswith('|'):
            if '---' in line_strip:
                continue
            parts = [p.strip() for p in line_strip.split('|')[1:-1]]
            if parts and parts[0] != '영역':  # 헤더 제외
                table_rows.append(parts)
            continue

        # 섹션 헤더 (##)
        if line.startswith('## '):
            sec_title = line[3:].strip()
            current_section = {
                'title': sec_title,
                'subsections': [],
                'intro_text': []
            }
            sections.append(current_section)
            continue
            
        # 서브섹션 헤더 (###)
        if line.startswith('### '):
            subsec_title = line[4:].strip()
            if current_section:
                current_section['subsections'].append({
                    'title': subsec_title,
                    'bullets': []
                })
            continue
            
        if not line_strip:
            continue
            
        # 일반 텍스트나 불릿 포인트 분배
        if line_strip.startswith('- ') or line_strip.startswith('* '):
            content = line_strip[2:].strip()
            if current_section and current_section['subsections']:
                current_section['subsections'][-1]['bullets'].append(content)
            elif current_section:
                current_section['intro_text'].append(content)
        else:
            if current_section and current_section['subsections']:
                # 이전 서브섹션의 불릿 뒤에 일반 텍스트 추가
                current_section['subsections'][-1]['bullets'].append(line_strip)
            elif current_section:
                current_section['intro_text'].append(line_strip)
                
    return title, meta, table_rows, sections

def escape_latex_text(text: str) -> str:
    # 물결표 ~ 이스케이프
    text = text.replace('~', r'\textasciitilde{}')

    # 1. LaTeX 특수 문자 이스케이프
    replacements = {
        '&': r'\&',
        '%': r'\%',
        '$': r'\$',
        '#': r'\#',
        '_': r'\_',
    }
    
    escaped = ""
    i = 0
    while i < len(text):
        if text[i] in replacements:
            escaped += replacements[text[i]]
        elif text[i] == '\\':
            escaped += r'\textbackslash{}'
        else:
            escaped += text[i]
        i += 1
        
    # 2. 마크다운 볼드 및 이탤릭 LaTeX 변환
    escaped = re.sub(r'\*\*([^*]+)\*\*', r'\\textbf{\1}', escaped)
    escaped = re.sub(r'\*([^*]+)\*', r'\\textit{\1}', escaped)
    
    return escaped


def build_report_latex(title, meta, table_rows, sections):
    latex = []
    latex.append(r"\documentclass[11pt,a4paper]{article}")
    latex.append(r"\usepackage{kotex}")
    latex.append(r"\usepackage{fontspec}")
    latex.append(r"\usepackage{geometry}")
    latex.append(r"\usepackage{xcolor}")
    latex.append(r"\usepackage{tcolorbox}")
    latex.append(r"\usepackage{fancyhdr}")
    latex.append(r"\usepackage{array}")
    latex.append(r"\usepackage{booktabs}")
    latex.append(r"\usepackage{tikz}")
    
    # 한글/영어 폰트 세팅
    latex.append(r"\setmainfont{Times New Roman}")
    latex.append(r"\setmainhangulfont{NanumGothic}")
    
    latex.append(r"\geometry{top=2.8cm, bottom=2.8cm, left=2.2cm, right=2.2cm, headsep=0.8cm}")
    
    # 헤더 및 푸터 스타일링
    latex.append(r"\pagestyle{fancy}")
    latex.append(r"\fancyhf{}")
    latex.append(r"\fancyhead[L]{\small\color{gray} " + BRAND + r" 레벨테스트 분석 리포트}")
    latex.append(r"\fancyhead[R]{\small\color{gray} 상담 및 학업 로드맵}")
    latex.append(r"\fancyfoot[C]{\small\thepage}")
    latex.append(r"\renewcommand{\headrulewidth}{0.4pt}")
    latex.append(r"\linespread{1.3}\selectfont")
    
    latex.append(r"\begin{document}")
    
    # 1. 메인 타이틀 박스
    latex.append(r"\begin{center}")
    latex.append(r"  \begin{tcolorbox}[colback=violet!4,colframe=violet!60,arc=3mm,width=\textwidth,boxrule=1.5pt,top=4mm,bottom=4mm]")
    latex.append(r"    \centering")
    latex.append(f"    {{\\LARGE\\bfseries\\color{{violet!85!black}} {title}}} \\\\")
    latex.append(r"    \vskip 0.6em")
    latex.append(r"    {\small\color{cyan!65!black} " + BRAND + r"}")
    latex.append(r"  \end{tcolorbox}")
    latex.append(r"\end{center}")
    latex.append(r"\vskip 1.0em")
    
    # 2. 학생 프로필 테이블
    latex.append(r"\noindent\textbf{\large\color{cyan!65!black} 원생 및 상담 기본 정보} \par")
    latex.append(r"\vspace{0.4em}")
    latex.append(r"\begin{table}[h]")
    latex.append(r"\centering")
    latex.append(r"\renewcommand{\arraystretch}{1.3}")
    latex.append(r"\begin{tabular}{p{3cm} p{4.5cm} p{3cm} p{4.5cm}}")
    latex.append(r"\hline")
    
    # meta 정보 매핑
    name = meta.get('원생 성명', '')
    grade = meta.get('학교 및 학년', '')
    date = meta.get('상담 일자', '')
    class_rec = meta.get('배정 추천반', '')
    books_rec = meta.get('추천 교재', '')
    
    latex.append(f"\\textbf{{원생 성명}} & {name} & \\textbf{{학교 및 학년}} & {grade} \\\\")
    latex.append(f"\\textbf{{상담 일자}} & {date} & \\textbf{{배정 추천반}} & {class_rec} \\\\")
    latex.append(f"\\textbf{{추천 교재}} & \\multicolumn{{3}}{{l}}{{{books_rec}}} \\\\")
    latex.append(r"\hline")
    latex.append(r"\end{tabular}")
    latex.append(r"\end{table}")
    latex.append(r"\vskip 1.0em")
    
    # 3. 영역별 성적 표 & TikZ 방사형 차트 나란히 배치
    if table_rows:
        # 점수 추출
        score_vocab = 60
        score_grammar = 60
        score_syntax = 60
        score_reading = 60
        score_writing = 60
        
        for row in table_rows:
            if len(row) >= 2:
                area = row[0].replace('**', '').strip()
                score_str = row[1].replace('**', '').replace('점', '').strip()
                try:
                    score = int(score_str)
                except ValueError:
                    score = 60
                    
                if '어휘' in area or 'Vocab' in area:
                    score_vocab = score
                elif '문법' in area or '어법' in area or 'Grammar' in area:
                    score_grammar = score
                elif '구문' in area or 'Syntax' in area:
                    score_syntax = score
                elif '논리' in area or '독해' in area or 'Reading' in area:
                    score_reading = score
                elif '서술형' in area or '영작' in area or 'Writing' in area:
                    score_writing = score

        latex.append(r"\noindent\textbf{\large\color{violet!80!black} 영역별 학습 역량 지수} \par")
        latex.append(r"\vspace{0.6em}")
        latex.append(r"\noindent")
        
        # 3-1. 성적 테이블 단독 배치 (1컬럼)
        latex.append(r"\begin{table}[h]")
        latex.append(r"\centering")
        latex.append(r"\renewcommand{\arraystretch}{1.3}")
        latex.append(r"\begin{tabular}{p{5cm} c c}")
        latex.append(r"\toprule")
        latex.append(r"\textbf{평가 영역} & \textbf{성취도 지수 (100점 기준)} & \textbf{성취도 판정} \\")
        latex.append(r"\midrule")
        
        for row in table_rows:
            if len(row) >= 3:
                area = escape_latex_text(row[0])
                score = escape_latex_text(row[1])
                result = escape_latex_text(row[2])
                
                # 판정 색상 부여
                if "우수" in result:
                    result_color = f"\\textcolor{{green!60!black}}{{\\textbf{{{result}}}}}"
                elif "집중" in result:
                    result_color = f"\\textcolor{{red!80!black}}{{\\textbf{{{result}}}}}"
                else:
                    result_color = f"\\textcolor{{orange!80!black}}{{\\textbf{{{result}}}}}"
                    
                latex.append(f"{area} & {score} & {result_color} \\\\")
                
        latex.append(r"\bottomrule")
        latex.append(r"\end{tabular}")
        latex.append(r"\end{table}")
        latex.append(r"\vskip 1.0em")
        
        # 3-2. TikZ 방사형 차트 단독 배치 (중앙 정렬 및 크기 복원)
        latex.append(r"\begin{center}")
        latex.append(r"\begin{tikzpicture}[scale=0.85, baseline=(current bounding box.center)]")
        latex.append(r"  \foreach \r in {20, 40, 60, 80, 100} {")
        latex.append(r"    \draw[color=gray!30, dashed] (90:\r*0.035) -- (162:\r*0.035) -- (234:\r*0.035) -- (306:\r*0.035) -- (18:\r*0.035) -- cycle;")
        latex.append(r"  }")
        latex.append(r"  \foreach \a in {90, 162, 234, 306, 18} {")
        latex.append(r"    \draw[color=gray!30] (0,0) -- (\a:3.7);")
        latex.append(r"    \fill[color=gray!50] (\a:3.5) circle (1.2pt);")
        latex.append(r"  }")
        
        latex.append(r"  \coordinate (vocab) at (90:%d*0.035);" % score_vocab)
        latex.append(r"  \coordinate (grammar) at (18:%d*0.035);" % score_grammar)
        latex.append(r"  \coordinate (syntax) at (306:%d*0.035);" % score_syntax)
        latex.append(r"  \coordinate (reading) at (234:%d*0.035);" % score_reading)
        latex.append(r"  \coordinate (writing) at (162:%d*0.035);" % score_writing)
        
        latex.append(r"  \fill[color=violet!30!cyan, opacity=0.35] (vocab) -- (writing) -- (reading) -- (syntax) -- (grammar) -- cycle;")
        latex.append(r"  \draw[color=violet!80!black, thick] (vocab) -- (writing) -- (reading) -- (syntax) -- (grammar) -- cycle;")
        
        latex.append(r"  \foreach \p in {vocab, grammar, syntax, reading, writing} {")
        latex.append(r"    \fill[color=violet!80!black] (\p) circle (2.5pt);")
        latex.append(r"    \fill[color=white] (\p) circle (1.2pt);")
        latex.append(r"  }")
        
        latex.append(r"  \node[above, font=\small\bfseries] at (90:3.8) {어휘력 (%d점)};" % score_vocab)
        latex.append(r"  \node[left, font=\small\bfseries] at (162:3.8) {서술형영작 (%d점)};" % score_writing)
        latex.append(r"  \node[below left, font=\small\bfseries] at (234:3.8) {논리독해 (%d점)};" % score_reading)
        latex.append(r"  \node[below right, font=\small\bfseries] at (306:3.8) {구문분석 (%d점)};" % score_syntax)
        latex.append(r"  \node[right, font=\small\bfseries] at (18:3.8) {문법/어법 (%d점)};" % score_grammar)
        latex.append(r"\end{tikzpicture}")
        latex.append(r"\end{center}")
        latex.append(r"\vskip 1.5em")
        
    # 4. 상세 분석 및 피드백 내용
    for sec in sections:
        sec_title = escape_latex_text(sec['title'])
        latex.append(f"\\noindent{{\\textbf{{\\Large\\color{{blue!75!black}} {sec_title}}}}} \\par")
        latex.append(r"\vspace{0.3em}")
        latex.append(r"{\color{blue!30}\hrule}")
        latex.append(r"\vspace{0.6em}")
        
        if sec['intro_text']:
            for txt in sec['intro_text']:
                latex.append(f"\\noindent {escape_latex_text(txt)} \\par")
                latex.append(r"\vspace{0.4em}")
                
        for subsec in sec['subsections']:
            sub_title = escape_latex_text(subsec['title'])
            latex.append(f"\\noindent\\textbf{{\\large\\color{{violet!80!black}} {sub_title}}} \\par")
            latex.append(r"\vspace{0.3em}")
            
            # 리포트 내용 박스 처리 (특히 종합 제안)
            if "종합" in sec_title or "전략" in sec_title:
                latex.append(r"\begin{tcolorbox}[colback=violet!4,colframe=cyan!40,arc=2.0mm,boxrule=0.8pt]")
                for bullet in subsec['bullets']:
                    latex.append(f"\\noindent {escape_latex_text(bullet)} \\par\\vspace{{0.3em}}")
                latex.append(r"\end{tcolorbox}")
            else:
                for bullet in subsec['bullets']:
                    latex.append(f"\\noindent \\quad $\\bullet$ {escape_latex_text(bullet)} \\par\\vspace{{0.3em}}")
            
            latex.append(r"\vspace{0.8em}")
            
    latex.append(r"\vspace{2.0em}")
    latex.append(r"\begin{flushright}")
    latex.append(r"\large\itshape " + BRAND + r" 드림")
    latex.append(r"\end{flushright}")
    
    latex.append(r"\end{document}")
    return "\n".join(latex)

def compile_report_to_pdf(input_md_path: Path, output_pdf_path: Path):
    if not input_md_path.exists():
        print(f"Error: {input_md_path} does not exist.")
        return False
        
    content = input_md_path.read_text(encoding='utf-8')
    title, meta, table_rows, sections = parse_report_markdown(content)
    latex_content = build_report_latex(title, meta, table_rows, sections)
    
    stem = f"temp_report_{input_md_path.stem}"
    temp_dir = Path(tempfile.gettempdir())
    temp_tex = temp_dir / f"{stem}.tex"
    temp_log = temp_dir / f"{stem}.log"
    temp_aux = temp_dir / f"{stem}.aux"
    temp_out = temp_dir / f"{stem}.out"
    
    temp_tex.write_text(latex_content, encoding='utf-8')
    
    xelatex_cmd = [
        "xelatex",
        "-interaction=nonstopmode",
        f"-output-directory={temp_dir}",
        str(temp_tex)
    ]
    
    success = False
    try:
        subprocess.run(xelatex_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        subprocess.run(xelatex_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        
        xelatex_pdf = temp_dir / f"{stem}.pdf"
        if xelatex_pdf.exists():
            output_pdf_path.parent.mkdir(parents=True, exist_ok=True)
            xelatex_pdf.replace(output_pdf_path)
            print(f"✅ Success: {output_pdf_path.name} created.")
            success = True
        else:
            print(f"❌ Error: Compiled PDF not found in temp dir for {input_md_path.name}")
    except subprocess.CalledProcessError as e:
        print(f"❌ XeLaTeX failed for {input_md_path.name}:")
        print("--- XeLaTeX Stdout ---")
        print(e.stdout)
        print("--- XeLaTeX Stderr ---")
        print(e.stderr)
    finally:
        if success:
            for f in [temp_tex, temp_log, temp_aux, temp_out]:
                if f.exists():
                    try:
                        f.unlink()
                    except Exception:
                        pass
                        
    return success

def main():
    parser = argparse.ArgumentParser(description="English Report PDF Compiler — Custom 1-column layout converter.")
    parser.add_argument("input", nargs="?", help="Markdown report file to compile.")
    
    args = parser.parse_args()
    
    resource_dir = Path("/Users/msn/Desktop/MS_Dev.nosync/projects/eng-student-manager/resource")
    
    if not args.input:
        input_path = resource_dir / "middle_intermediate_simulation.md"
    else:
        input_path = Path(args.input)
        if not input_path.is_absolute():
            input_path = resource_dir / input_path
            
    output_pdf = input_path.parent / f"{input_path.stem}.pdf"
    compile_report_to_pdf(input_path, output_pdf)

if __name__ == "__main__":
    main()
