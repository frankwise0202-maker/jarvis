// Intent matching for the status assistant. A question is normalised, typo-corrected against the words
// below, then matched with small, readable patterns: conversational intents (greeting, how are you,
// thanks...), topics (cpu, gpu, memory, disk, network, api, site, tailscale) and aspects (temperature,
// usage, processes, space...). classify() returns { intent, topics, aspects, device, greeted, reason }.
//
// Intents: greeting, how-are-you, status, problems, events, cpu, gpu, memory, disk, network, api, site,
// tailscale, temperature, multi, uptime, restarts, trend, time, thanks, bye, identity, capabilities, unknown.

import { normalize, correctTypos } from './normalize.mjs';

export const INTENTS = [
  'greeting',
  'how-are-you',
  'status',
  'problems',
  'events',
  'cpu',
  'gpu',
  'memory',
  'disk',
  'network',
  'api',
  'site',
  'tailscale',
  'temperature',
  'multi',
  'uptime',
  'restarts',
  'trend',
  'time',
  'thanks',
  'bye',
  'identity',
  'capabilities',
  'unknown',
];

const TOPICS = {
  cpu: /\b(cpu|processor|processors|proc|chip|cores|i7|intel)\b|\bcore (temp|temperature|usage|load)\b/,
  gpu: /\b(gpu|graphics|graphic|graphics card|video card|videocard|nvidia|geforce|gtx|970|vram)\b|\bcard\b/,
  memory: /\b(ram|memory|mem)\b/,
  disk: /\b(disk|disks|drive|drives|hard drive|harddrive|hdd|ssd|storage|seagate|barracuda|space)\b/,
  network: /\b(network|internet|wifi|ethernet|lan|bandwidth|download|downloading|upload|uploading|ping|latency|lag|ip|ip address)\b|\b(connection|online|offline|traffic)\b/,
  api: /\b(claude|anthropic|api|ai service)\b/,
  site: /\b(website|site|web app|webapp|github|github pages|pages|deploy|deployed|deployment)\b|\bbuild\b|\bjarvis app\b/,
  tailscale: /\b(tailscale|tailnet|vpn|devices|device|phone|iphone|ipad|mac|macbook|laptop|tablet|android)\b/,
};

const ASPECTS = {
  temp: /\b(temp|temperature|temperatures|hot|hotter|hottest|heat|warm|warmer|cool|cooler|cold|colder|degrees|celsius|thermal|overheat|overheating|burning|toasty|fever)\b/,
  processes: /\b(process|processes|app|apps|application|applications|program|programs|task|tasks|eating|hogging|hog|hogs)\b|\b(what|who|which) is using\b|\busing (the )?most\b|\btop (5|five|processes|apps|programs)\b|\bwhat is (taking|eating|chewing)\b/,
  usage: /\b(usage|use|used|load|busy|utili[sz]ation|percent|percentage|working hard|workload|stressed|maxed|pegged)\b/,
  vram: /\b(vram|video memory|graphics memory|gpu memory)\b/,
  driver: /\b(driver|drivers)\b/,
  fan: /\b(fan|fans)\b/,
  power: /\b(power|watts|watt|wattage)\b/,
  freq: /\b(frequency|clock speed|clocks|ghz|mhz|turbo)\b|\bcpu speed\b|\bspeed of the cpu\b|\bhow fast is the (cpu|processor)\b/,
  space: /\b(space|full|free|left|capacity|room|filling|filled)\b/,
  activity: /\b(activity|reading|writing|io|throughput|disk busy)\b/,
  health: /\b(health|healthy|smart|failing|dying|dead|sectors|wear|worn)\b/,
  speed: /\b(speed|fast|slow|bandwidth|download|downloading|upload|uploading|traffic|mbps|throughput)\b/,
  latency: /\b(ping|latency|lag|laggy|response time)\b/,
  internet: /\b(internet|online|offline|connected|connection|outage|down|up)\b/,
  swap: /\b(swap|swapping|swapfile)\b/,
  ip: /\b(ip|ip address|address)\b/,
  trend: /\b(usual|usually|normal for|average|typical|typically|lately|trend|trends|this week|compared|than normal|than before|than yesterday|hotter|warmer|cooler|colder|busier|quieter|getting worse)\b/,
};

const P = {
  greeting: /^(hi|hello|hey|hiya|howdy|yo|greetings|good (morning|afternoon|evening|day)|morning|afternoon|evening|what is up)\b/,
  howAreYou:
    /\b(how are you|how are you doing|how you doing|how do you do|how is it going|how are things|how are we|how are you feeling|how do you feel|how have you been|how is life|how are you holding up|how is the (machine|computer|system|pc|box|rig|home base|base|core)|how is everything|everything (ok|good|fine|alright|all right)|all good|you (are )?(ok|good|alright|all right|well|fine|alive|healthy)|are you (ok|good|alright|all right|well|fine|alive|healthy|there|awake|working|running)|feeling (ok|good|alright)|(are )?you doing (ok|okay|alright|all right|well|good|fine))\b/,
  status: /\b(status|report|summary|summarise|summarize|overview|sitrep|rundown|run down|stats|statistics|diagnostics|full report|system report|update me|brief me|briefing|readout|numbers|vitals)\b/,
  problems:
    /\b(anything wrong|something wrong|what is wrong|wrong with|any (problems|problem|issues|issue|warnings|warning|alerts|alert|errors|error|trouble|concerns)|problems|problem|issues|warnings|alerts|errors|trouble|broken|is anything (broken|wrong|off)|concerns|need attention|needs attention|worry|worried|red flags|is it bad)\b/,
  events: /\b(what happened|anything happen|any events|recent events|event log|the log|log|history|what did i miss|while i was (away|out|gone|asleep)|overnight|last night|so far today|happened)\b/,
  uptime:
    /\b(uptime|up time|how long (have|has) (you|it|the (computer|machine|system|pc|core)) been (up|on|running|awake|going)|how long (are|is) (you|it) (up|on|running)|running since|since when|been running|been on|been up|how long have you been)\b/,
  restarts: /\b(restart|restarted|restarts|reboot|rebooted|reboots|crash|crashed|crashes|last boot|booted|power cut|power outage|went down|shut down|shutdown|turned off|switched off)\b/,
  time: /\b(what time|the time|time is it|what is the time|current time|what day|what date|the date|date today|today s date|what is today|clock)\b|^(time|date|day|today)$/,
  thanks: /\b(thanks|thank you|cheers|appreciate it|appreciated|nice one|great job|good job|well done|ta|brilliant|perfect|awesome|cool thanks)\b/,
  bye: /\b(bye|goodbye|good bye|see you|see ya|later|good night|goodnight|night night|catch you later|that is all|that is it|nothing else|signing off)\b/,
  identity: /\b(who are you|what are you|your name|what is your name|who am i talking to|who is this|are you jarvis|are you (a|an) (ai|bot|robot|person|human))\b/,
  capabilities: /\b(what can you do|what do you do|help|what can i ask|what should i ask|what do you know|commands|options|how do you work|what are you for|what are you good at|menu)\b/,
  // Requests for things the assistant cannot do (it only reports).
  action:
    /^(please )?(can you |could you |would you |will you |go |just |jarvis )?(please )?(restart|reboot|shut ?down|turn (off|on)|power (off|down|on)|kill|close|quit|open|launch|start|stop|run|install|uninstall|update the|upgrade|delete|remove|clean|clear|free up|play|pause|search|google|look up|send|email|text|call|order|buy|set|change|fix|lower|raise|increase|decrease|speed up|overclock|cool down|end|terminate|wake|sleep|suspend|lock|unlock|log ?out|sign ?out|mute|unmute)\b/,
  offtopic: /\b(weather|forecast|raining|news|joke|jokes|song|music|movie|film|recipe|football|score|stock|stocks|bitcoin|crypto|homework|math|translate|poem|story|girlfriend|boyfriend)\b/,
  room: /\b(outside|outdoors|in here|the room|room temperature|weather)\b/,
};

const DEVICE = /\b(iphone|phone|ipad|tablet|mac|macbook|laptop|android)\b/;

/** Every single word the patterns use: the vocabulary for typo correction. */
export const VOCAB = (() => {
  const words = new Set();
  const add = (re) => {
    for (const w of re.source.replace(/\\b|\\s|[()?^$:+*|]|\[[^\]]*\]/g, ' ').split(/\s+/)) {
      if (/^[a-z][a-z0-9]{2,}$/.test(w)) words.add(w);
    }
  };
  for (const re of [...Object.values(TOPICS), ...Object.values(ASPECTS), ...Object.values(P), DEVICE]) add(re);
  for (const w of ['temperature', 'graphics', 'memory', 'processor', 'internet', 'tailscale', 'website', 'restart', 'warnings', 'problems', 'status', 'report', 'usage', 'healthy', 'storage', 'utilization', 'utilisation', 'average', 'hello', 'thanks', 'goodbye', 'running', 'normal', 'anything', 'wrong', 'connected']) words.add(w);
  // Ordinary words that must never be "corrected" into keywords.
  for (const w of ['main', 'hold', 'holding', 'told', 'mail', 'gain', 'hear', 'near', 'role', 'cars', 'fold', 'bold', 'gold', 'mind', 'kind', 'find', 'fire', 'hire', 'wire', 'rest', 'test', 'best', 'tired', 'drove', 'river', 'diver', 'sorry', 'hey', 'yes', 'yeah', 'nope', 'the', 'and', 'what', 'how', 'are', 'you', 'your', 'this', 'that', 'there', 'with', 'have', 'been', 'much', 'many', 'tell', 'give', 'show', 'about', 'right', 'now', 'today', 'still', 'doing', 'good', 'some', 'like', 'more', 'less', 'than', 'very', 'really', 'feel', 'feeling', 'mine', 'here', 'look', 'looks', 'looking', 'check', 'jarvis', 'home', 'base', 'please', 'does', 'will', 'would', 'could', 'should', 'when', 'where', 'which', 'last', 'week', 'month', 'hour', 'hours', 'minute', 'minutes', 'second', 'seconds', 'everything', 'something', 'nothing', 'things', 'thing', 'computer', 'machine', 'system', 'everyone', 'okay', 'well', 'fine', 'alright', 'great', 'nice', 'cool', 'reach', 'working', 'work', 'going', 'getting', 'make', 'sure', 'quick', 'quickly', 'currently', 'current', 'temps', 'stat', 'stats', 'note', 'mean']) words.add(w);
  return words;
})();

/** Classify a question. */
export function classify(text) {
  const raw = String(text ?? '');
  const base = normalize(raw);
  if (!base) return { intent: 'unknown', reason: 'empty', topics: [], aspects: [], normalized: base };
  const n = correctTypos(base, VOCAB);
  const has = (re) => re.test(n);
  const topics = Object.keys(TOPICS).filter((k) => has(TOPICS[k]));
  const aspects = Object.keys(ASPECTS).filter((k) => has(ASPECTS[k]));
  const device = DEVICE.exec(n)?.[1] ?? null;
  const greeted = has(P.greeting);
  const out = (intent, extra = {}) => ({ intent, topics, aspects, device, greeted, normalized: n, ...extra });

  // "space" alone means disk space; "up/down" alone does not make a network question.
  if (topics.includes('tailscale') && topics.includes('network') && !/\b(internet|wifi|ethernet|ping|latency|ip)\b/.test(n)) topics.splice(topics.indexOf('network'), 1);
  if (aspects.includes('vram')) {
    // "video memory" is the graphics card's, not the computer's RAM
    if (topics.includes('memory')) topics.splice(topics.indexOf('memory'), 1);
    if (!topics.includes('gpu')) topics.push('gpu');
  }
  if (topics.includes('site') && topics.includes('api') && /\bbuild\b/.test(n) && !/\b(claude|anthropic)\b/.test(n)) topics.splice(topics.indexOf('api'), 1);

  // Out of scope first: requests to do things, then off-topic subjects (unless they also ask about the machine).
  if (has(P.action) && !has(P.status)) {
    const verb = P.action.exec(n)?.[4] ?? null;
    return out('unknown', { reason: 'action', verb });
  }
  if (has(P.room) && aspects.includes('temp') && !topics.length) return out('unknown', { reason: 'room' });
  if (has(P.offtopic) && !topics.length && !aspects.some((a) => ['temp', 'usage', 'processes'].includes(a))) return out('unknown', { reason: 'offtopic' });

  if (has(P.identity)) return out('identity');
  if (has(P.capabilities) && !topics.length) return out('capabilities');
  if (aspects.includes('trend') && !topics.some((t) => ['api', 'site', 'tailscale'].includes(t))) return out('trend');
  if (has(P.uptime)) return out('uptime');
  if (has(P.restarts) && !topics.some((t) => ['gpu', 'api', 'site', 'tailscale'].includes(t))) return out('restarts');
  if (has(P.time) && !/\b(response time|up time|uptime)\b/.test(n)) return out('time');
  if (has(P.events) && !topics.length) return out('events');

  const hardware = topics.filter((t) => ['cpu', 'gpu', 'memory', 'disk', 'network'].includes(t));
  if (topics.length === 1) return out(topics[0]);
  if (hardware.length >= 2) return out('multi');
  if (topics.length > 1) return out(topics[0]);

  if (has(P.problems)) return out('problems');
  if (has(P.status)) return out('status');
  // No topic named: infer it from the aspect.
  if (aspects.includes('temp')) return out('temperature');
  if (aspects.includes('vram') || aspects.includes('driver') || aspects.includes('fan') || aspects.includes('power')) return out('gpu');
  if (aspects.includes('swap')) return out('memory');
  if (aspects.includes('processes')) return out('cpu');
  if (aspects.includes('latency') || aspects.includes('ip')) return out('network');
  if (aspects.includes('space') && !has(P.howAreYou)) return out('disk');
  if (aspects.includes('health') && /\b(disk|drive|smart|sectors)\b/.test(n)) return out('disk');
  if (has(P.status)) return out('status');
  if (has(P.howAreYou)) return out('how-are-you');
  if (aspects.includes('usage') || aspects.includes('freq')) return out('cpu');
  if (aspects.includes('speed')) return out('network');
  if (has(P.thanks)) return out('thanks');
  if (has(P.bye)) return out('bye');
  if (greeted) return out('greeting');
  if (aspects.includes('health')) return out('how-are-you');
  return out('unknown', { reason: 'no-match' });
}
