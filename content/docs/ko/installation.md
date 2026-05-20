# 설치

Polymux는 설치 없이 브라우저에서 전부 사용할 수 있습니다. 네이티브 앱과 브라우저 확장 프로그램은 호스팅된 브라우저 대신 로컬 브라우저를 직접 사용하는 등의 추가 기능을 제공합니다.

## 웹 앱

[polymux.com](https://polymux.com)의 웹 앱은 항상 최신 버전입니다. 최신 Chromium, Firefox, Safari 릴리스라면 모두 작동합니다. 설치할 것이 없습니다. 로그인하면 워크스페이스, 세션, 워크플로를 즉시 사용할 수 있습니다.

## 브라우저 확장

확장 프로그램을 사용하면 Polymux 세션이 서버의 호스팅된 Chromium 대신 **로컬 브라우저**의 탭을 조작할 수 있습니다. 다음과 같은 경우에 유용합니다.

- 기존 로그인 쿠키를 사용하는 사이트.
- 호스팅된 브라우저가 접근할 수 없는 사설 네트워크.
- 특정 브라우저 프로필, 확장 프로그램 목록 또는 장치 핑거프린트.

설치하려면 [Install page](/install-apps)를 열고 브라우저를 선택하세요. 확장 프로그램이 페어링을 요청하면 아무 탭에서나 Polymux에 로그인하세요. 페어링이 자동으로 이루어지고 팝업에 _Connected_가 표시됩니다.

확장 프로그램은 연결되어 있는 동안 완전히 수동적입니다. Polymux 세션이 `?mode=extension`일 때만 작동합니다. 팝업에서 언제든지 해지할 수 있습니다.

## 데스크톱 앱

macOS, Windows, Linux용 네이티브 앱은 브라우저 탭 없이 Polymux 전체 경험을 제공합니다. 현재 비공개 베타 상태입니다. 여러분의 플랫폼용 빌드가 제공되면 알림을 받으려면 [Install page](/install-apps)에서 등록하세요.

데스크톱 앱은 필수가 아닙니다. 이 문서의 모든 기능은 웹 앱에서 작동합니다.

## 모바일 앱

iOS 및 Android 앱은 로드맵에 있습니다. 현재 웹 앱은 반응형이며 모바일 브라우저에서 작동하지만, 라이브 뷰포트는 데스크톱에서 가장 잘 스트리밍됩니다.

## 시스템 요구 사항

| 표면 | 요구 사항 |
| --- | --- |
| 웹 앱 | 지난 24개월 내에 출시된 모든 브라우저 |
| 확장 프로그램 | Chrome, Edge, Brave 또는 Chromium 119+ |
| 데스크톱 | macOS 13+, Windows 10+ 또는 최근 3년 내의 Linux 배포판 |
| 네트워크 | 포트 443 / 8080에서 WebRTC 및 WebSocket 송신 |

네트워크가 WebRTC를 차단하면 라이브 뷰포트는 더 느린 폴링 스트림으로 대체됩니다. 그 외 모든 기능은 계속 작동합니다.

## 다음 단계

- Polymux를 처음 사용하시나요? [Quickstart](/documentation/quickstart)로 계속하세요.
- 팀을 설정하시나요? [Workspaces and members](/documentation/workspaces)를 읽어보세요.
- 다운로드 검증이 필요하신가요? FAQ의 [Updates and verification](/documentation/faq#verifying-downloads)을 참고하세요.
