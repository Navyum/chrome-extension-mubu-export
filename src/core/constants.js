export const MUBU_API = {
  LIST: 'https://api2.mubu.com/v3/api/list/get_all_documents_page',
  LIST_GET: 'https://api2.mubu.com/v3/api/list/get',
  LIST_GET_FOLDER: 'https://api2.mubu.com/v3/api/list/get_folder',
  DOC_DETAIL: 'https://api2.mubu.com/v3/api/document/edit/get',
  CONVERT_EXPORT: 'https://mubu.com/convert/export',
  IMAGE_HOST: 'https://document-image.mubu.com/',
  HOME_PAGE: 'https://mubu.com',
};

export const EXPORT_FORMATS = {
  md: { extension: 'md', mime: 'text/markdown' },
  opml: { extension: 'opml', mime: 'text/xml' },
  json: { extension: 'json', mime: 'application/json' },
  mm: { extension: 'mm', mime: 'text/xml' },
  html: { extension: 'html', mime: 'text/html' },
  pdf: { extension: 'pdf', mime: 'application/pdf' },
  docx: { extension: 'doc', mime: 'application/msword' }
};

// Formats that use the remote Mubu convert API instead of local formatting
export const REMOTE_EXPORT_FORMATS = new Set(['pdf']);
