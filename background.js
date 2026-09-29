// 툴바 아이콘을 누르면 side panel이 열리게 함. 이것만 함.
// 설치/업데이트 때와 서비스 워커가 시작될 때 둘 다 설정하고, 실패는 콘솔에만 남김.
const openOnClick = () =>
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onInstalled.addListener(openOnClick);
openOnClick();
