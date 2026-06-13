import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  // 상대 경로 base: GitHub Pages 하위 경로(/eng-student-manager/) 및
  // file:// 더블클릭 실행 양쪽에서 리소스 경로가 깨지지 않도록 한다.
  base: './',
  // 데이터(LocalStorage)는 origin(포트)별로 완전히 분리되므로 dev 포트를 고정한다.
  // strictPort: 포트 점유 시 5176 등으로 슬그머니 밀려 데이터가 다른 origin으로
  // 갈라지는 사고를 막고, 명시적인 에러로 알려준다.
  server: { port: 5175, strictPort: true },
  plugins: [react(), viteSingleFile()],
})

