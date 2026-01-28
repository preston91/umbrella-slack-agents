// src/services/memory.js
// In-memory store. Easy to swap for Redis/Postgres later.

const store = {
  events: [],
  tasks: [],
};

function logEvent(channel, agent, text) {
  store.events.push({
    channel,
    agent,
    text,
    time: new Date().toISOString(),
  });
}

function logTask(from, to, task) {
  store.tasks.push({
    from,
    to,
    task,
    time: new Date().toISOString(),
  });
}

function getEvents() {
  return [...store.events];
}

function getTasks() {
  return [...store.tasks];
}

function clearAll() {
  store.events = [];
  store.tasks = [];
}

function getSummaryData() {
  return {
    events: getEvents(),
    tasks: getTasks(),
  };
}

module.exports = {
  logEvent,
  logTask,
  getEvents,
  getTasks,
  clearAll,
  getSummaryData,
};
