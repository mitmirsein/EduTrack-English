const RadarChart = ({ scores, type }) => {
  const isAchievement = type === 'achievement';
  // 유효한 영역만 필터링하여 items 정의 (null, undefined, 'N/A' 필터링)
  const items = isAchievement ? [
    { key: 'nouns_articles', label: '명사/관사 (Nouns)', value: scores.nouns_articles },
    { key: 'pronouns', label: '대명사 (Pronouns)', value: scores.pronouns },
    { key: 'verbs', label: '동사 (Verbs)', value: scores.verbs },
    { key: 'modifiers', label: '형용사/부사 (Modifiers)', value: scores.modifiers },
    { key: 'prepositions', label: '전치사 (Preps)', value: scores.prepositions },
  ] : [
    { key: 'vocab', label: '어휘력 (Vocab)', value: scores.vocab },
    { key: 'grammar', label: '문법 (Grammar)', value: scores.grammar },
    { key: 'syntax', label: '구문독해 (Syntax)', value: scores.syntax },
    { key: 'reading', label: '논리독해 (Reading)', value: scores.reading },
    { key: 'writing', label: '서술형 영작 (Writing)', value: scores.writing },
  ];

  const filteredItems = items.filter(item => item.value !== undefined && item.value !== null && item.value !== 'N/A');

  const totalPoints = filteredItems.length;
  const center = 150;
  const maxRadius = 100;

  // 삼각함수로 각 점의 좌표 계산 (12시 방향에서 시작하기 위해 -Math.PI / 2)
  const getCoordinates = (index, value) => {
    const angle = (2 * Math.PI / totalPoints) * index - Math.PI / 2;
    const radius = (Number(value || 0) / 100) * maxRadius;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    return { x, y };
  };

  // 배경 가이드 라인 (20%, 40%, 60%, 80%, 100% 지점 다각형들)
  const gridLevels = [20, 40, 60, 80, 100];
  const gridPolygons = gridLevels.map(level => {
    const points = [];
    for (let i = 0; i < totalPoints; i++) {
      const { x, y } = getCoordinates(i, level);
      points.push(`${x},${y}`);
    }
    return points.join(' ');
  });

  // 축(Spokes) 그리기
  const spokes = [];
  for (let i = 0; i < totalPoints; i++) {
    const outer = getCoordinates(i, 100);
    spokes.push({ x1: center, y1: center, x2: outer.x, y2: outer.y });
  }

  // 학생의 성적 성취도 다각형 데이터
  const scorePoints = [];
  for (let i = 0; i < totalPoints; i++) {
    const { x, y } = getCoordinates(i, filteredItems[i].value);
    scorePoints.push(`${x},${y}`);
  }
  const scorePolygonString = scorePoints.join(' ');

  // 텍스트 레이블 좌표 (100% 라인보다 살짝 더 바깥에 배치)
  const getLabelCoordinates = (index) => {
    const angle = (2 * Math.PI / totalPoints) * index - Math.PI / 2;
    const radius = maxRadius + 20; // 텍스트 여백 확보
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    return { x, y };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '20px auto' }}>
      <svg width="320" height="320" viewBox="0 0 320 320" style={{ overflow: 'visible' }}>
        {/* 그라데이션 정의 */}
        <defs>
          <radialGradient id="radarGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent-gradient-start, #7c3aed)" stopOpacity="0.1" />
            <stop offset="100%" stopColor="var(--accent-gradient-end, #3b82f6)" stopOpacity="0.45" />
          </radialGradient>
        </defs>

        {/* 배경 그리드 다각형들 */}
        {gridPolygons.map((points, idx) => (
          <polygon
            key={idx}
            points={points}
            fill="none"
            stroke="var(--radar-grid-color, #e2e8f0)"
            strokeWidth="1"
            strokeDasharray={idx === 4 ? 'none' : '3,3'}
          />
        ))}

        {/* 축 스포크 */}
        {spokes.map((spoke, idx) => (
          <line
            key={idx}
            x1={spoke.x1}
            y1={spoke.y1}
            x2={spoke.x2}
            y2={spoke.y2}
            stroke="var(--radar-grid-color, #cbd5e1)"
            strokeWidth="1"
          />
        ))}

        {/* 학생 성적 다각형 영역 */}
        {totalPoints >= 3 && (
          <polygon
            points={scorePolygonString}
            fill="url(#radarGrad)"
            stroke="var(--primary-accent, #6366f1)"
            strokeWidth="2.5"
            className="radar-poly"
            style={{ transition: 'all 0.4s ease-in-out' }}
          />
        )}

        {/* 성적 지점 마커 원들 */}
        {filteredItems.map((item, idx) => {
          const { x, y } = getCoordinates(idx, item.value);
          return (
            <circle
              key={idx}
              cx={x}
              cy={y}
              r="4.5"
              fill="var(--primary-accent, #6366f1)"
              stroke="#ffffff"
              strokeWidth="1.5"
              style={{ transition: 'all 0.4s ease-in-out' }}
            />
          );
        })}

        {/* 각 영역 레이블 명 및 백분율 표시 */}
        {filteredItems.map((item, idx) => {
          const { x, y } = getLabelCoordinates(idx);
          let textAnchor = 'middle';
          let dy = '0.35em';

          // 좌표 방향에 따라 레이블의 정렬(textAnchor) 세밀 조정
          if (x < center - 10) {
            textAnchor = 'end';
          } else if (x > center + 10) {
            textAnchor = 'start';
          }
          
          if (y < center - maxRadius) {
            dy = '-0.2em';
          } else if (y > center + maxRadius - 10) {
            dy = '0.2em';
          }

          return (
            <text
              key={idx}
              x={x}
              y={y}
              textAnchor={textAnchor}
              fill="var(--text-color-primary, #1e293b)"
              fontSize="12.5"
              fontWeight="600"
              fontFamily="inherit"
            >
              <tspan x={x} dy={dy}>{item.label.split(' ')[0]}</tspan>
              <tspan x={x} dy="1.25em" fill="var(--primary-accent, #4f46e5)" fontSize="11.5" fontWeight="700">{item.value}점</tspan>
            </text>
          );
        })}
      </svg>
    </div>
  );
};

export default RadarChart;
