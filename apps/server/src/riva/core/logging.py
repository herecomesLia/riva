from enum import StrEnum


class LogLevel(StrEnum):
    critical = "critical"
    error = "error"
    warning = "warning"
    info = "info"
    debug = "debug"
    trace = "trace"
