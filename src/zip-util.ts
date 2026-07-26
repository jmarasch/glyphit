import { requestUrl } from 'obsidian';

/**
 * Download a zip file from a url and return the bytes of the file as an ArrayBuffer.
 * @param url String url of the zip file to download.
 * @returns ArrayBuffer of the zip file.
 */
export const downloadZipFile = async (url: string): Promise<ArrayBuffer> => {
  const fetched = await requestUrl({ url });
  const bytes = fetched.arrayBuffer;
  return bytes;
};
