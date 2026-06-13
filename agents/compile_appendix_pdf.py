#!/usr/bin/env python3
import sys
from pathlib import Path

# compile_exam_pdf.py의 함수를 재사용하기 위해 sys.path 추가
sys.path.append(str(Path(__file__).parent))
from compile_exam_pdf import compile_to_pdf

def compile_all_appendix():
    # 스크립트 위치 기준 상대 경로 (어느 클론/포크에서 실행해도 자기 레포를 가리킴)
    project_dir = Path(__file__).resolve().parents[1]
    
    # 1. 부록 테스트 빌드
    md_dir = project_dir / "appendix_test" / "md"
    pdf_dir = project_dir / "appendix_test" / "pdf"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    
    md_files = list(md_dir.glob("*.md"))
    if md_files:
        print(f"Found {len(md_files)} appendix tests. Compiling to student and teacher PDFs...")
        for md_file in md_files:
            student_pdf = pdf_dir / f"{md_file.stem}_student.pdf"
            teacher_pdf = pdf_dir / f"{md_file.stem}_teacher.pdf"
            print(f"\nProcessing appendix: {md_file.name}...")
            compile_to_pdf(md_file, student_pdf, mode='student')
            compile_to_pdf(md_file, teacher_pdf, mode='teacher')
            
    # 2. 정기 성취도 테스트 빌드
    ach_md_dir = project_dir / "achievement_test" / "md"
    ach_pdf_dir = project_dir / "achievement_test" / "pdf"
    ach_pdf_dir.mkdir(parents=True, exist_ok=True)
    
    ach_md_files = list(ach_md_dir.glob("*.md"))
    if ach_md_files:
        print(f"\nFound {len(ach_md_files)} achievement tests. Compiling to student and teacher PDFs...")
        for md_file in ach_md_files:
            student_pdf = ach_pdf_dir / f"{md_file.stem}_student.pdf"
            teacher_pdf = ach_pdf_dir / f"{md_file.stem}_teacher.pdf"
            print(f"\nProcessing achievement: {md_file.name}...")
            compile_to_pdf(md_file, student_pdf, mode='student')
            compile_to_pdf(md_file, teacher_pdf, mode='teacher')

    print("\nAll appendix and achievement tests compiled successfully.")

if __name__ == "__main__":
    compile_all_appendix()
