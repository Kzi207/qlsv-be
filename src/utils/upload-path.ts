import os from 'os';
import path from 'path';

export const getEvidenceUploadRootDir = () => {
  const baseDir = process.env.VERCEL ? os.tmpdir() : process.cwd();
  return path.join(baseDir, 'uploads', 'evidence');
};
