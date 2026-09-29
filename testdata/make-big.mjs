// 대용량 가져오기 테스트 파일 생성: node testdata/make-big.mjs
// big-under.json (~8MB, 들어가야 함) / big-over.json (~13MB, "Storage is full…" 에러가 나야 함)
import { writeFileSync } from 'node:fs';

const make = (mb) => {
  const body = '가나다 abc 😀 '.repeat(2000); // ~ 40KB 본문
  const n = Math.ceil((mb * 1024 * 1024) / Buffer.byteLength(body)); // 저장소 용량은 UTF-8 바이트 기준
  return JSON.stringify(Array.from({ length: n }, (_, i) => ({ title: `Big ${i}`, text: `${i} ${body}` })));
};

writeFileSync(new URL('./big-under.json', import.meta.url), make(8));
writeFileSync(new URL('./big-over.json', import.meta.url), make(13));
console.log('done');
