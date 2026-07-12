export const SUPPORTED_LANGUAGES = ['zh', 'en'];

const translations = {
  zh: {
    'document.title': '3D 全息扫雷 | Holo-Sweeper 3D',
    'document.description': '一款具有全方位 3D 空间探索、层级切片分析与粒子特效的未来科技感多人扫雷游戏。',
    'language.toggle': 'EN',
    'subtitle': '全息空间扫雷终端',
    'stats.time': '⏱️ 时间', 'stats.mines': '🚩 标记/地雷', 'stats.progress': '💠 空间净化率',
    'settings.title': '维度矩阵设置', 'settings.easy': '初级', 'settings.medium': '中级', 'settings.hard': '高级',
    'settings.easyMeta': '3x3x3 (3雷)', 'settings.mediumMeta': '5x5x5 (15雷)', 'settings.hardMeta': '7x7x7 (45雷)',
    'settings.custom': '⚙️ 自定义矩阵', 'settings.width': 'X轴 (宽):', 'settings.height': 'Y轴 (高):',
    'settings.depth': 'Z轴 (深):', 'settings.mineCount': '地雷数量:',
    'mode.title': '操作模式', 'mode.dig': '⛏️ 挖掘模式', 'mode.flag': '🚩 标记模式',
    'mode.digTitle': '快捷键: D', 'mode.flagTitle': '快捷键: F',
    'action.restart': '初始化矩阵', 'action.resetCamera': '🎥 重置视角', 'action.resetCameraTitle': '重置相机视角',
    'action.soundOn': '🔊 音效:开', 'action.soundOff': '🔇 音效:关', 'action.soundTitle': '切换音效', 'action.resetSlices': '重置切片',
    'guide.title': '🖱️ 操作说明', 'guide.rotate': '左键拖拽: 旋转空间视角', 'guide.pan': '右键拖拽: 平移视角',
    'guide.click': '左键点击: 挖掘 / 插旗', 'guide.flag': '右键点击: 快捷插旗/取消标记', 'guide.keys': '[D] / [F] 键: 模式切换',
    'players.title': '👥 房间玩家', 'players.roomCode': '房间号: {code}', 'players.copyInvite': '复制邀请',
    'chat.title': '💬 事故与交流记录', 'chat.welcome': '-- 欢迎加入量子网络 --', 'chat.placeholder': '按回车发送消息...', 'chat.send': '发送',
    'result.lostTitle': '矩阵崩溃', 'result.lostDefault': '你触发了空间地雷，维度解体。',
    'result.lostMessage': '您误触了反物质地雷，导致当前时空矩阵发生连锁坍缩。',
    'result.wonTitle': '净化完成', 'result.wonMessage': '完美避开所有危险能量节点，该空间维度已被成功净化归零！',
    'result.elapsed': '所用时间', 'result.progress': '空间净化', 'result.inspect': '查看战场', 'result.restart': '重新初始化',
    'revive.title': '看广告复活？', 'revive.prompt': '您触碰了反物质地雷！是否观看 10 秒广告进行量子回溯？',
    'revive.watch': '观看广告', 'revive.end': '结束游戏', 'revive.playing': '广告播放中（广告位招租中……）',
    'revive.countdown': '广告播放中 ({seconds})...', 'revive.finishing': '正在完成量子回溯…',
    'lobby.title': '接入量子网络', 'lobby.subtitle': '创建量子房间，或通过朋友分享的 6 位密钥接入',
    'lobby.nickname': '玩家昵称 (必填):', 'lobby.nicknamePlaceholder': '默认：银狼', 'lobby.room': '房间号 (必填):',
    'lobby.roomPlaceholder': '例如：ABC234', 'lobby.create': '创建房间', 'lobby.join': '加入房间', 'nickname.default': '银狼',
    'status.creating': '正在创建量子房间…', 'status.joining': '正在申请接入房间…', 'status.connecting': '正在建立安全连接…',
    'status.reconnecting': '网络波动，正在恢复房间…', 'status.connected': '连接成功', 'status.disconnected': '连接已断开',
    'system.prefix': '[系统]', 'system.inviteCopied': '邀请链接已复制', 'system.copyPrompt': '复制这个邀请链接：',
    'error.runtime': '⚠️ 游戏运行错误', 'error.file': '文件', 'error.line': '行号', 'error.stack': '堆栈',
    'error.roomFallback': '房间连接失败。', 'error.HOST_ONLY': '只有房主可以重新初始化矩阵。',
    'error.ROOM_FULL': '房间人数已满。', 'error.NAME_TAKEN': '这个昵称已被使用。', 'error.WRONG_PHASE': '当前阶段不能执行这个操作。',
    'error.INVALID_CELL': '方块坐标无效。', 'error.EMPTY_CHAT': '消息不能为空。', 'error.INVALID_COMMAND': '命令格式无效。',
    'error.STALE_COMMAND': '命令序号已经过期。', 'error.RATE_LIMITED': '请求太频繁，请稍后再试。',
    'error.INVALID_NAME': '请输入昵称。', 'error.ROOM_NOT_FOUND': '没有找到这个房间。', 'error.ROOM_CODE': '房间码应为 6 位字母或数字。',
    'error.SOCKET_CLOSED': '房间连接已关闭。', 'error.NOT_JOINED': '请先加入房间。', 'error.REQUEST_FAILED': '房间服务请求失败。',
    'activity.joined': '{name} 接入了量子网络', 'activity.restarted': '{name} 重新初始化了矩阵',
    'activity.mineTriggered': '🚨 {name} 踩到了反物质地雷', 'activity.dug': '{name} 挖开了空间方块',
    'activity.won': '🏆 空间矩阵净化完成', 'activity.flagged': '{name} 切换了空间标记',
    'activity.reviveStarted': '📺 {name} 启动了量子回溯', 'activity.gaveUp': '💥 {name} 放弃了量子回溯',
    'activity.revived': '量子回溯完成，矩阵恢复运行',
  },
  en: {
    'document.title': 'Holo-Sweeper 3D | Multiplayer 3D Minesweeper',
    'document.description': 'A futuristic multiplayer 3D Minesweeper with spatial slicing, particle effects, and real-time rooms.',
    'language.toggle': '中文',
    'subtitle': 'Holographic Spatial Minesweeper Terminal',
    'stats.time': '⏱️ Time', 'stats.mines': '🚩 Flags / Mines', 'stats.progress': '💠 Purification',
    'settings.title': 'Matrix Settings', 'settings.easy': 'Easy', 'settings.medium': 'Medium', 'settings.hard': 'Hard',
    'settings.easyMeta': '3x3x3 (3 mines)', 'settings.mediumMeta': '5x5x5 (15 mines)', 'settings.hardMeta': '7x7x7 (45 mines)',
    'settings.custom': '⚙️ Custom Matrix', 'settings.width': 'X axis (width):', 'settings.height': 'Y axis (height):',
    'settings.depth': 'Z axis (depth):', 'settings.mineCount': 'Mine count:',
    'mode.title': 'Action Mode', 'mode.dig': '⛏️ Dig Mode', 'mode.flag': '🚩 Flag Mode',
    'mode.digTitle': 'Shortcut: D', 'mode.flagTitle': 'Shortcut: F',
    'action.restart': 'Initialize Matrix', 'action.resetCamera': '🎥 Reset View', 'action.resetCameraTitle': 'Reset camera view',
    'action.soundOn': '🔊 Sound: On', 'action.soundOff': '🔇 Sound: Off', 'action.soundTitle': 'Toggle sound', 'action.resetSlices': 'Reset Slices',
    'guide.title': '🖱️ Controls', 'guide.rotate': 'Left drag: Rotate view', 'guide.pan': 'Right drag: Pan view',
    'guide.click': 'Left click: Dig / flag', 'guide.flag': 'Right click: Quick flag toggle', 'guide.keys': '[D] / [F]: Switch mode',
    'players.title': '👥 Room Players', 'players.roomCode': 'Room: {code}', 'players.copyInvite': 'Copy Invite',
    'chat.title': '💬 Incidents & Chat', 'chat.welcome': '-- Welcome to the quantum network --', 'chat.placeholder': 'Press Enter to send...', 'chat.send': 'Send',
    'result.lostTitle': 'Matrix Collapsed', 'result.lostDefault': 'You triggered a spatial mine. The dimension collapsed.',
    'result.lostMessage': 'An antimatter mine destabilized the matrix and caused a dimensional chain collapse.',
    'result.wonTitle': 'Purification Complete', 'result.wonMessage': 'All hazardous energy nodes were avoided. This spatial dimension is now fully purified!',
    'result.elapsed': 'Elapsed Time', 'result.progress': 'Purification', 'result.inspect': 'Inspect Field', 'result.restart': 'Reinitialize',
    'revive.title': 'Revive with an Ad?', 'revive.prompt': 'You touched an antimatter mine. Watch a 10-second ad to initiate a quantum rewind?',
    'revive.watch': 'Watch Ad', 'revive.end': 'End Game', 'revive.playing': 'Ad playing (this space is available...)',
    'revive.countdown': 'Ad playing ({seconds})...', 'revive.finishing': 'Completing quantum rewind…',
    'lobby.title': 'Connect to the Quantum Network', 'lobby.subtitle': 'Create a room or enter the six-character key shared by a friend',
    'lobby.nickname': 'Nickname (required):', 'lobby.nicknamePlaceholder': 'Default: silver wolf', 'lobby.room': 'Room code (required):',
    'lobby.roomPlaceholder': 'Example: ABC234', 'lobby.create': 'Create Room', 'lobby.join': 'Join Room', 'nickname.default': 'silver wolf',
    'status.creating': 'Creating quantum room…', 'status.joining': 'Requesting room access…', 'status.connecting': 'Establishing secure connection…',
    'status.reconnecting': 'Network interrupted. Restoring room…', 'status.connected': 'Connected', 'status.disconnected': 'Disconnected',
    'system.prefix': '[SYSTEM]', 'system.inviteCopied': 'Invite link copied', 'system.copyPrompt': 'Copy this invite link:',
    'error.runtime': '⚠️ Game runtime error', 'error.file': 'File', 'error.line': 'Line', 'error.stack': 'Stack',
    'error.roomFallback': 'Unable to connect to the room.', 'error.HOST_ONLY': 'Only the host can initialize the matrix.',
    'error.ROOM_FULL': 'The room is full.', 'error.NAME_TAKEN': 'That nickname is already in use.', 'error.WRONG_PHASE': 'That action is unavailable right now.',
    'error.INVALID_CELL': 'Invalid cell coordinates.', 'error.EMPTY_CHAT': 'The message cannot be empty.', 'error.INVALID_COMMAND': 'Invalid command format.',
    'error.STALE_COMMAND': 'That command sequence has expired.', 'error.RATE_LIMITED': 'Too many requests. Please try again later.',
    'error.INVALID_NAME': 'Please enter a nickname.', 'error.ROOM_NOT_FOUND': 'This room could not be found.', 'error.ROOM_CODE': 'The room code must contain six letters or digits.',
    'error.SOCKET_CLOSED': 'The room connection was closed.', 'error.NOT_JOINED': 'Join a room first.', 'error.REQUEST_FAILED': 'The room request failed.',
    'activity.joined': '{name} connected to the quantum network', 'activity.restarted': '{name} reinitialized the matrix',
    'activity.mineTriggered': '🚨 {name} triggered an antimatter mine', 'activity.dug': '{name} excavated a spatial cell',
    'activity.won': '🏆 Spatial matrix purification complete', 'activity.flagged': '{name} toggled a spatial marker',
    'activity.reviveStarted': '📺 {name} initiated a quantum rewind', 'activity.gaveUp': '💥 {name} abandoned the quantum rewind',
    'activity.revived': 'Quantum rewind complete. The matrix is operational again.',
  },
};

export function normalizeLanguage(value) {
  return String(value || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function initialLanguage() {
  let saved = null;
  try { saved = localStorage.getItem('holo-sweeper.language'); } catch {}
  return SUPPORTED_LANGUAGES.includes(saved) ? saved : normalizeLanguage(navigator.language);
}

export function translate(language, key, params = {}) {
  const template = translations[language]?.[key] ?? translations.zh[key] ?? key;
  return Object.entries(params).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)), template);
}
