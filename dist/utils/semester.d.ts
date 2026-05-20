export type SemesterScope = {
    name: string;
    startDate: Date | null;
    endDate: Date | null;
    isGlobal: boolean;
    scopeClasses: Array<{
        name: string;
    }>;
};
export type SemesterSubmissionStatus = {
    isOpen: boolean;
    reason: 'OPEN' | 'NOT_FOUND' | 'CLASS_SCOPE_MISMATCH' | 'NOT_STARTED' | 'ENDED';
    semester: string;
    now: string;
    startDate: string | null;
    endDate: string | null;
};
export declare const getSemesterClosedMessage: (status: SemesterSubmissionStatus) => "Hoc ky chua duoc cau hinh trong he thong" | "Hoc ky nay khong ap dung cho lop cua ban" | "Chua den thoi gian nop phieu cho hoc ky nay" | "Da het thoi gian nop phieu cho hoc ky nay" | "Khong the nop phieu cho hoc ky nay";
export declare const normalizeSemesterName: (value: unknown) => string;
export declare const parseSemesterDateInput: (value: unknown, mode: "start" | "end") => Date | null;
export declare const getSemesterWithScope: (semesterName: string) => Promise<SemesterScope | null>;
export declare const canSemesterApplyToClass: (semester: SemesterScope, classId?: string | null) => boolean;
export declare const getSemesterSubmissionStatus: ({ semesterName, semester, classId, now, }: {
    semesterName: string;
    semester: SemesterScope | null;
    classId?: string | null;
    now?: Date;
}) => SemesterSubmissionStatus;
//# sourceMappingURL=semester.d.ts.map