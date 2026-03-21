// export const environment = {
//   apiUrl: `http://${window.location.hostname}:8888`,
//   workflowServiceUrl: `http://${window.location.hostname}:8085`,
//   production: false,
// };
function getApiUrl(): string {
  const hostname = window.location.hostname;
  if (hostname === 'localhost') return 'http://localhost:8888';
  if (hostname.includes('ngrok')) return 'https://nonconfidently-treelined-ammie.ngrok-free.dev';
  return `http://${hostname}:8888`;
}

function getWorkflowUrl(): string {
  const hostname = window.location.hostname;
  if (hostname === 'localhost') return 'http://localhost:8085';
  if (hostname.includes('ngrok')) return 'http://192.168.1.15:8085';
  return `http://${hostname}:8085`;
}

export const environment = {
  apiUrl: getApiUrl(),
  workflowServiceUrl: getWorkflowUrl(),
  production: false,
};
// function getApiUrl(): string {
//   const hostname = window.location.hostname;
//   if (hostname === 'localhost') return 'http://localhost:8888';
//   if (hostname.includes('ngrok')) return 'https://TON_URL_GATEWAY.ngrok-free.app';
//   return `http://${hostname}:8888`;
// }

// function getWorkflowUrl(): string {
//   const hostname = window.location.hostname;
//   if (hostname === 'localhost') return 'http://localhost:8085';
//   if (hostname.includes('ngrok')) return 'https://TON_URL_WORKFLOW.ngrok-free.app';
//   return `http://${hostname}:8085`;
// }

// export const environment = {
//   apiUrl: getApiUrl(),
//   workflowServiceUrl: getWorkflowUrl(),
//   production: false,
// };