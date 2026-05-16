import prisma from './prisma';

export type SemesterScope = {
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  isGlobal: boolean;
  scopeClasses: Array<{ name: string }>;
};

export type SemesterSubmissionStatus = {
  isOpen: boolean;
  reason: 'OPEN' | 'NOT_FOUND' | 'CLASS_SCOPE_MISMATCH' | 'NOT_STARTED' | 'ENDED';
  semester: string;
  now: string;
  startDate: string | null;
  endDate: string | null;
};

export const getSemesterClosedMessage = (status: SemesterSubmissionStatus) => {
  switch (status.reason) {
    case 'NOT_FOUND':
      return 'Hoc ky chua duoc cau hinh trong he thong';
    case 'CLASS_SCOPE_MISMATCH':
      return 'Hoc ky nay khong ap dung cho lop cua ban';
    case 'NOT_STARTED':
      return 'Chua den thoi gian nop phieu cho hoc ky nay';
    case 'ENDED':
      return 'Da het thoi gian nop phieu cho hoc ky nay';
    default:
      return 'Khong the nop phieu cho hoc ky nay';
  }
};

export const normalizeSemesterName = (value: unknown) => String(value || '').trim().toUpperCase();

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const parseSemesterDateInput = (value: unknown, mode: 'start' | 'end'): Date | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    if (DATE_ONLY_PATTERN.test(raw)) {
      if (mode === 'start') parsed.setUTCHours(0, 0, 0, 0);
      else parsed.setUTCHours(23, 59, 59, 999);
    }
    return parsed;
  }

  return null;
};

export const getSemesterWithScope = async (semesterName: string): Promise<SemesterScope | null> => {
  return (prisma as any).semester.findUnique({
    where: { name: semesterName },
    include: { scopeClasses: { select: { name: true } } },
  });
};

export const canSemesterApplyToClass = (semester: SemesterScope, classId?: string | null) => {
  if (semester.isGlobal) return true;
  if (!classId) return false;
  return semester.scopeClasses.some((item) => item.name === classId);
};

export const getSemesterSubmissionStatus = ({
  semesterName,
  semester,
  classId,
  now = new Date(),
}: {
  semesterName: string;
  semester: SemesterScope | null;
  classId?: string | null;
  now?: Date;
}): SemesterSubmissionStatus => {
  const base = {
    semester: semesterName,
    now: now.toISOString(),
    startDate: semester?.startDate ? semester.startDate.toISOString() : null,
    endDate: semester?.endDate ? semester.endDate.toISOString() : null,
  };

  if (!semester) {
    return {
      ...base,
      isOpen: false,
      reason: 'NOT_FOUND',
    };
  }

  if (!canSemesterApplyToClass(semester, classId)) {
    return {
      ...base,
      isOpen: false,
      reason: 'CLASS_SCOPE_MISMATCH',
    };
  }

  if (semester.startDate && now.getTime() < semester.startDate.getTime()) {
    return {
      ...base,
      isOpen: false,
      reason: 'NOT_STARTED',
    };
  }

  if (semester.endDate && now.getTime() > semester.endDate.getTime()) {
    return {
      ...base,
      isOpen: false,
      reason: 'ENDED',
    };
  }

  return {
    ...base,
    isOpen: true,
    reason: 'OPEN',
  };
};
