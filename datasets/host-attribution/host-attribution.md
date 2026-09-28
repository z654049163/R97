# R97 宿主归属测量

生成时间：2026-09-23T09:05:54.836Z

参与测量的根节点：356

`inferRequiredRuntimeIds` 决定「代码用了这个全局，必须把哪个宿主拉进比较」。
名单太窄会漏掉宿主专属 API（目标集没声明该宿主时可能放行），太宽会把无关宿主
拉进目标集制造过度保护。这份测量不靠「语料里见过」补名单，而是实测每个根节点在
各宿主上的存在性，把「只有一个宿主存在且尚未映射」的项列成候选。

## 候选：宿主专属但未映射

| 根节点 | 唯一存在的宿主 | 是否已在 HOST_GLOBAL_ROOTS |
|---|---|---|
| $gwl | wechat | 否 |
| $gwn | wechat | 否 |
| $gwx | wechat | 否 |
| FileReader | edge | 否 |
| Image | edge | 否 |
| SVGRect | edge | 否 |
| WebKitCSSMatrix | edge | 否 |
| Window | edge | 否 |
| __wxConfig | wechat | 否 |
| close | edge | 否 |
| define | wechat | 否 |
| f | wechat | 否 |
| gra | wechat | 否 |
| grb | wechat | 否 |
| requireOnce | wechat | 否 |
| stop | edge | 否 |
| wh | wechat | 否 |

这些是候选，不是自动生效的名单。加进 `HOST_RUNTIME_ROOTS` 前需要按平台规范确认：
测量只说明「当前这台机器上的这个版本如此」，不说明规范如此。

## 完整测量表

| 根节点 | 判定 | 语言基线 | Node | Edge | 微信 | 已映射到 |
|---|---|---|---|---|---|---|
| $gwl | host_exclusive_unmapped | 无 | 无 | 无 | 有 | - |
| $gwn | host_exclusive_unmapped | 无 | 无 | 无 | 有 | - |
| $gwx | host_exclusive_unmapped | 无 | 无 | 无 | 有 | - |
| $gwx_wx013447465d3aa024 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx032b78128e980502 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx043a474648d3d591 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx069ba97219f66d99 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx0e203209e27b1e66 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx104a1a20c3f81ec2 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx116d0dd5e6a39ac7 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx12cec70855c0cacf | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx1629d117cf9be937 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx1fe8d9a3cb067a75 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx293c4b6097a8a4d0 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx2b03c6e691cd7370 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx308bd2aeb83d3345 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx34345ae5855f892d | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx3b49cd549eb1ae7f | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx3eb462803881d2f1 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx43d5971c94455481 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx4418e3e031e551be | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx4664e59e8a284069 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx4a1d9449e295d1a3 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx4d2deeab3aed6e5a | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx4ed749733ed0e8e8 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx50b5593e81dd937a | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx5917c8c26f85c588 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx5ec22d3a6a176039 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx5fcce12afdff9918 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx610ea582556c983e | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx62d350f80724f9b0 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx63d6102e26f0a3f8 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx63ffb7b7894e99ae | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx6885acbedba59c14 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx69b7451feb427f0e | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx6afed118d9e81df9 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx70d57361939e63ef | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx71acb46aa72fff57 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx76a9a06e5b4e693e | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx7a4658085b18b581 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx80b5f24d05ef8e63 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx82e6ae1175f264fa | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx8d04ad0492dab24d | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx92c68dae5a8bb046 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx94a6522b1d640c3b | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx97d76316fee0e8fe | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wx9acc1deb2cb15bba | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxa16657d57059e0f0 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxa75efa648b60994b | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxaae6519cee98d824 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxb7c8f9ea9ceb4663 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxbc055599e4059c9f | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxbe275ff84246f1a4 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxd1d3a59c204109d4 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxd65104595293601e | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxdabb25f880cb2a03 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxdd4927ede9acd724 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxdf01634fc34b7886 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxe6129e9cc9619c07 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxee969de81bba9a45 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxefa63d84fe9f64a2 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxefe655223916819e | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxf3f436ba9bd4be7b | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| $gwx_wxf51d01cf670e28d3 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| AES_CTR_set_options | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| AES_Decrypt_finish | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| AES_Decrypt_process | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| AES_Encrypt_finish | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| AES_Encrypt_process | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| AES_reset | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| AES_set_iv | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| AES_set_key | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| AES_set_padding | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| AbortController | cross_host | 无 | 有 | 有 | 未观测 | - |
| AbortSignal | cross_host | 无 | 有 | 有 | 未观测 | - |
| AdManager | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| App | host_exclusive_mapped | 无 | 无 | 无 | 有 | e4-wechat-real |
| AsyncIterator | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| Behavior | absent_everywhere | 无 | 无 | 无 | 未观测 | e4-wechat-real |
| BigInteger | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| Blob | cross_host | 无 | 有 | 有 | 未观测 | - |
| BroadcastChannel | cross_host | 无 | 有 | 有 | 未观测 | - |
| Buffer | host_exclusive_mapped | 无 | 有 | 无 | 未观测 | e2-node-24.21.0 |
| C | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| CONFIG | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| Component | absent_everywhere | 无 | 无 | 无 | 未观测 | e4-wechat-real |
| Crypto | cross_host | 无 | 有 | 有 | 未观测 | - |
| CryptoJS | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| CustomEvent | cross_host | 无 | 有 | 有 | 未观测 | - |
| D | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| DEBUG | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| DIMOND_SERVER_DOMAIN | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| Event | cross_host | 无 | 有 | 有 | 未观测 | - |
| EventTarget | cross_host | 无 | 有 | 有 | 未观测 | - |
| File | cross_host | 无 | 有 | 有 | 未观测 | - |
| FileReader | host_exclusive_unmapped | 无 | 无 | 有 | 未观测 | - |
| FormData | cross_host | 无 | 有 | 有 | 未观测 | - |
| G | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| GameGlobal | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| Headers | cross_host | 无 | 有 | 有 | 未观测 | - |
| HmacSHA1 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| Image | host_exclusive_unmapped | 无 | 无 | 有 | 未观测 | - |
| Iterator | cross_host | 无 | 有 | 有 | 有 | - |
| MessageChannel | cross_host | 无 | 有 | 有 | 未观测 | - |
| MessagePort | cross_host | 无 | 有 | 有 | 未观测 | - |
| MutationObserver | host_exclusive_mapped | 无 | 无 | 有 | 未观测 | e5-edge-headless |
| Observer | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| PHCNTRUST | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| PHCrypJS | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| Page | host_exclusive_mapped | 无 | 无 | 无 | 有 | e4-wechat-real |
| R | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| R_htmlToWxml | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| Reporter | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| Request | cross_host | 无 | 有 | 有 | 未观测 | - |
| Response | cross_host | 无 | 有 | 有 | 未观测 | - |
| SL | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| SLConverter | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| SVGRect | host_exclusive_unmapped | 无 | 无 | 有 | 未观测 | - |
| SuppressedError | cross_host | 无 | 有 | 有 | 有 | - |
| Taro | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| TextDecoder | cross_host | 无 | 有 | 有 | 有 | - |
| TextEncoder | cross_host | 无 | 有 | 有 | 有 | - |
| Type | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| URL | cross_host | 无 | 有 | 有 | 未观测 | - |
| URLSearchParams | cross_host | 无 | 有 | 有 | 未观测 | - |
| VM2_INTERNAL_STATE_DO_NOT_USE_OR_PROGRAM_WILL_FAIL | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| WXEnvironment | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| WebKitCSSMatrix | host_exclusive_unmapped | 无 | 无 | 有 | 未观测 | - |
| WebSocket | cross_host | 无 | 有 | 有 | 未观测 | - |
| WeixinJSBridge | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| Window | host_exclusive_unmapped | 无 | 无 | 有 | 未观测 | - |
| XMLHttpRequest | host_exclusive_mapped | 无 | 无 | 有 | 未观测 | e5-edge-headless |
| Z | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| __VUE_SSR_CONTEXT__ | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| __appServiceSDK__ | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| __dirname | host_exclusive_mapped | 无 | 有 | 无 | 未观测 | e2-node-24.21.0 |
| __subContextEngine__ | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| __wxConfig | host_exclusive_unmapped | 无 | 无 | 无 | 有 | - |
| _appNavigater | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _array_like_to_array | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _array_with_holes | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _array_without_holes | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _chooseImage | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _classCallCheck2 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _constants | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _createClass2 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _define_property | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _index | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _iterable_to_array | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _iterable_to_array_limit | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _non_iterable_rest | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _non_iterable_spread | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _require | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _require2 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _size | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _type | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _typeof | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _typeof3 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _unsupported_iterable_to_array | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _util | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| _utils | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| a | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| active | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| aesjs | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| api | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| app | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| array | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| arrayLikeToArray | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| arrayWithHoles | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| arrayWithoutHoles | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| assertThisInitialized | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| atob | cross_host | 无 | 有 | 有 | 有 | - |
| b | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| btoa | cross_host | 无 | 有 | 有 | 未观测 | - |
| buildInAppellationObj | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| c | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| c1 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| c2 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| c3 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| calc | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| cb | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| checkLogin | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| clearImmediate | host_exclusive_mapped | 无 | 有 | 无 | 未观测 | e2-node-24.21.0 |
| clearInterval | cross_host | 无 | 有 | 有 | 有 | - |
| clearTimeout | cross_host | 无 | 有 | 有 | 有 | - |
| close | host_exclusive_unmapped | 无 | 无 | 有 | 未观测 | - |
| cloud | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| colorIndex | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| complete | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| config | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| console | cross_host | 无 | 有 | 有 | 有 | - |
| constructor | cross_host | 无 | 有 | 有 | 有 | - |
| crypto | cross_host | 无 | 有 | 有 | 未观测 | - |
| currentTime | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| d | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| data | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| debugInfo | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| decrypt | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| default | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| define | host_exclusive_unmapped | 无 | 无 | 无 | 有 | - |
| defineProperty | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| describe | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| devices_list | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| document | host_exclusive_mapped | 无 | 无 | 有 | 未观测 | e5-edge-headless |
| e | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| encrypt | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| exports | host_exclusive_mapped | 无 | 有 | 无 | 未观测 | e2-node-24.21.0 |
| f | host_exclusive_unmapped | 无 | 无 | 无 | 有 | - |
| fetch | cross_host | 无 | 有 | 有 | 未观测 | - |
| filterCode | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| first_scene | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| getApp | host_exclusive_mapped | 无 | 无 | 无 | 有 | e4-wechat-real |
| getCurrentPages | host_exclusive_mapped | 无 | 无 | 无 | 有 | e4-wechat-real |
| getItem | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| getPrototypeOf | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| gl | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| global | cross_host | 无 | 有 | 有 | 未观测 | - |
| gra | host_exclusive_unmapped | 无 | 无 | 无 | 有 | - |
| grb | host_exclusive_unmapped | 无 | 无 | 无 | 有 | - |
| h | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| i | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| importScripts | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| index | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| ios | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| isCall | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| isNativeReflectConstruct | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| isRunning | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| iterableToArray | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| iterableToArrayLimit | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| l | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| layer | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| loader | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| localStorage | host_exclusive_mapped | 无 | 无 | 有 | 未观测 | e5-edge-headless |
| location | host_exclusive_mapped | 无 | 无 | 有 | 未观测 | e5-edge-headless |
| log | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| m | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| module | host_exclusive_mapped | 无 | 有 | 无 | 未观测 | e2-node-24.21.0 |
| msg | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| my | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| n | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| navigator | cross_host | 无 | 有 | 有 | 未观测 | e5-edge-headless |
| node:assert | host_exclusive_mapped | 无 | 有 | 无 | 未观测 | e2-node-24.21.0 |
| node:fs | host_exclusive_mapped | 无 | 有 | 无 | 未观测 | e2-node-24.21.0 |
| node:path | host_exclusive_mapped | 无 | 有 | 无 | 未观测 | e2-node-24.21.0 |
| nodeRequest | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nonIterableRest | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nonIterableSpread | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| noop | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_0 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_1 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_10 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_11 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_12 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_13 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_14 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_15 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_16 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_17 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_18 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_19 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_2 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_21 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_22 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_23 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_24 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_29 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_3 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_30 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_4 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_5 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_6 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_7 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_8 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nt_9 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_Array | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv__startMovingY | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_address | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_colFormatVehicleInfo | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_colFormatVehicleState | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_const | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_fmt1 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_fmt2 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_formatColorName | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_formatStationName | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_formatVehicleInfo | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_getTvlWidth | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_instanceLen | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_navigator | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_nt_0 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_nt_1 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_nt_5 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_nt_6 | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_owner | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_showBox | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_showLine | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_size | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_style | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_textViewInstance | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_v | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| nv_window | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| o | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| objectWithoutPropertiesLoose | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| off | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| on | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| onHide | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| orderId | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| p | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| possibleConstructorReturn | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| process | host_exclusive_mapped | 无 | 有 | 无 | 未观测 | e2-node-24.21.0 |
| queueMicrotask | cross_host | 无 | 有 | 有 | 未观测 | - |
| r | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| requestAnimationFrame | cross_host | 无 | 无 | 有 | 有 | - |
| require | cross_host | 无 | 有 | 无 | 有 | e2-node-24.21.0 |
| requireOnce | host_exclusive_unmapped | 无 | 无 | 无 | 有 | - |
| res | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| resolve | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| result | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| root | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| run | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| s | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| savedAppid | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| selectedIds | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| self | cross_host | 无 | 无 | 有 | 有 | - |
| sessionStorage | host_exclusive_mapped | 无 | 无 | 有 | 未观测 | e5-edge-headless |
| setImmediate | host_exclusive_mapped | 无 | 有 | 无 | 未观测 | e2-node-24.21.0 |
| setInterval | cross_host | 无 | 有 | 有 | 有 | - |
| setItem | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| setPrototypeOf | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| setTimeout | cross_host | 无 | 有 | 有 | 有 | - |
| snap_bb | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| song | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| stop | host_exclusive_unmapped | 无 | 无 | 有 | 未观测 | - |
| storage | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| superPropBase | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| swan | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| t | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| that | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| themeListeners | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| toPrimitive | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| toPropertyKey | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| toString | cross_host | 无 | 有 | 有 | 未观测 | - |
| tt | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| u | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| uni | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| unsupportedIterableToArray | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| util | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| version | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| wh | host_exclusive_unmapped | 无 | 无 | 无 | 有 | - |
| window | cross_host | 无 | 无 | 有 | 有 | e5-edge-headless |
| words | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| worker | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| ws | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| wx | host_exclusive_mapped | 无 | 无 | 无 | 有 | e4-wechat-real |
| wxCommonHost | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| wx_login | absent_everywhere | 无 | 无 | 无 | 未观测 | - |
| x | absent_everywhere | 无 | 无 | 无 | 未观测 | - |

判定含义：`cross_host` 多个宿主都有，不应绑定到单一宿主；`absent_everywhere` 全都不存在，
属于应用自定义或测试框架全局；`host_exclusive_unmapped` 只有一个宿主存在且未映射，是候选；
其余为已覆盖或未观测。

