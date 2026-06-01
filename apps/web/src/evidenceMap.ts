export function evidenceFactLabel(evidenceId: string, facts: { sequence: number; evidenceIds: string[] }[]) {
  const sequences = facts
    .filter((fact) => fact.evidenceIds.includes(evidenceId))
    .map((fact) => fact.sequence);
  return sequences.length ? sequences.map((sequence) => `진술 ${sequence}`).join(', ') : '연결 확인';
}
