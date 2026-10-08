
/** save text as file in browser downloads */
const downloadText = (fileName: string, text: string, mimeType: string = 'text/plain') => {
  const url = URL.createObjectURL(new Blob([text], {type: `${mimeType};charset=utf-8`}));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // download has started - url is not needed anymore
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default downloadText;
