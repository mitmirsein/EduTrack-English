import { useId } from 'react';

const LineChart = ({ data, title = '성적 추이' }) => {
  // SVG 그라데이션 id는 문서 전체에서 유일해야 한다 (차트 여러 개 동시 렌더링 대응)
  const gradientId = useId();
  // 데이터가 없을 경우 플레이스홀더 표시
  if (!data || data.length === 0) {
    return (
      <div className="line-chart-placeholder">
        <p>기록된 성적 데이터가 없습니다.</p>
      </div>
    );
  }

  // 꺾은선 차트 설정
  const width = 500;
  const height = 220;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // X, Y 좌표 계산기
  // x축은 데이터 개수만큼 분할
  const getX = (index) => {
    if (data.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (data.length - 1)) * chartWidth;
  };

  // y축은 0점부터 100점까지 매핑
  const getY = (score) => {
    const minScore = 0;
    const maxScore = 100;
    return paddingTop + chartHeight - ((score - minScore) / (maxScore - minScore)) * chartHeight;
  };

  // 선의 Path 생성 (d 속성용)
  const linePath = data
    .map((item, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx)} ${getY(item.score)}`)
    .join(' ');

  // 면(Area) 채우기용 Path 생성 (차트 아래 바닥까지 연결)
  const areaPath = data.length > 0 
    ? `${linePath} L ${getX(data.length - 1)} ${paddingTop + chartHeight} L ${getX(0)} ${paddingTop + chartHeight} Z`
    : '';

  // Y축 가이드선 스케일 (0, 20, 40, 60, 80, 100점)
  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div className="line-chart-container" style={{ margin: '15px 0', width: '100%' }}>
      <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--text-color-primary, #1e293b)' }}>{title}</h4>
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ minWidth: '400px', overflow: 'visible' }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary-accent, #6366f1)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--primary-accent, #6366f1)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* 가로 가이드라인 및 Y축 레이블 */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="var(--radar-grid-color, #e2e8f0)"
                  strokeWidth="0.8"
                  strokeDasharray="4,4"
                />
                <text
                  x={paddingLeft - 10}
                  y={y}
                  textAnchor="end"
                  dy="0.35em"
                  fontSize="10"
                  fill="var(--text-color-secondary, #64748b)"
                  fontWeight="600"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* 그라데이션 채우기 영역 */}
          {data.length > 0 && (
            <path
              d={areaPath}
              fill={`url(#${gradientId})`}
              style={{ transition: 'all 0.3s ease-in-out' }}
            />
          )}

          {/* 꺾은선 그리기 */}
          {data.length > 0 && (
            <path
              d={linePath}
              fill="none"
              stroke="var(--primary-accent, #4f46e5)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transition: 'all 0.3s ease-in-out' }}
            />
          )}

          {/* 데이터 마커 및 텍스트 팝업 */}
          {data.map((item, idx) => {
            const x = getX(idx);
            const y = getY(item.score);
            return (
              <g key={idx}>
                <circle
                  cx={x}
                  cy={y}
                  r="4"
                  fill="var(--primary-accent, #4f46e5)"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  style={{ transition: 'all 0.3s ease-in-out' }}
                />
                <text
                  x={x}
                  y={y - 8}
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight="bold"
                  fill="var(--primary-accent, #4f46e5)"
                >
                  {item.score}
                </text>
              </g>
            );
          })}

          {/* X축 날짜/회차 레이블 */}
          {data.map((item, idx) => {
            const x = getX(idx);
            return (
              <text
                key={idx}
                x={x}
                y={height - paddingBottom + 18}
                textAnchor="middle"
                fontSize="9"
                fill="var(--text-color-secondary, #64748b)"
                fontWeight="500"
              >
                {item.date}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default LineChart;
