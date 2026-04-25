export default function extractApiErrorMessage(requestError, fallbackMessage) {
  return (
    requestError?.response?.data?.message ||
    requestError?.response?.data?.error ||
    fallbackMessage
  );
}
