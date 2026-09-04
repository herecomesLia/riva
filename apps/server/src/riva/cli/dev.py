import asyncio
import os
import signal
import subprocess
from collections.abc import Sequence
from pathlib import Path


async def run_dev(
    *,
    watch_path: Path,
    server_args: Sequence[str],
    worker_args: Sequence[str],
    stop_timeout_seconds: float,
) -> None:
    from watchfiles import awatch

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    handles_sigterm = os.name != "nt"
    if handles_sigterm:
        loop.add_signal_handler(signal.SIGTERM, stop_event.set)

    processes = await _start_processes(server_args, worker_args)
    watcher = awatch(
        watch_path,
        watch_filter=lambda _change, path: path.endswith(".py"),
        stop_event=stop_event,
    )
    try:
        while not stop_event.is_set():
            changed = asyncio.create_task(anext(watcher))
            stopped = asyncio.create_task(stop_event.wait())
            exited = [asyncio.create_task(process.wait()) for process in processes]
            pending = [changed, stopped, *exited]
            try:
                done, _ = await asyncio.wait(
                    pending,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if stopped in done:
                    break
                if changed in done:
                    try:
                        changed.result()
                    except StopAsyncIteration:
                        break
                    await _stop_processes(processes, stop_timeout_seconds)
                    processes = await _start_processes(server_args, worker_args)
                    continue

                index = next(i for i, task in enumerate(exited) if task in done)
                name = "server" if index == 0 else "worker"
                raise RuntimeError(
                    f"Development {name} exited with code {exited[index].result()}."
                )
            finally:
                for task in pending:
                    if not task.done():
                        task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)
    finally:
        stop_event.set()
        await watcher.aclose()
        await _stop_processes(processes, stop_timeout_seconds)
        if handles_sigterm:
            loop.remove_signal_handler(signal.SIGTERM)


async def _start_processes(
    server_args: Sequence[str],
    worker_args: Sequence[str],
) -> tuple[asyncio.subprocess.Process, asyncio.subprocess.Process]:
    server = await _spawn_process(*server_args)
    try:
        worker = await _spawn_process(*worker_args)
    except BaseException:
        await _stop_processes((server,), 5)
        raise
    return server, worker


async def _spawn_process(*args: str) -> asyncio.subprocess.Process:
    command = ("riva", *args)
    if os.name == "nt":
        return await asyncio.create_subprocess_exec(
            *command,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
    return await asyncio.create_subprocess_exec(*command, start_new_session=True)


async def _stop_processes(
    processes: Sequence[asyncio.subprocess.Process],
    timeout_seconds: float,
) -> None:
    for process in processes:
        _terminate_process_group(process)

    try:
        async with asyncio.timeout(timeout_seconds):
            await asyncio.gather(*(process.wait() for process in processes))
    except TimeoutError:
        for process in processes:
            _kill_process_group(process)
        await asyncio.gather(*(process.wait() for process in processes))


def _terminate_process_group(process: asyncio.subprocess.Process) -> None:
    if process.returncode is not None:
        return
    try:
        if os.name == "nt":
            process.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass


def _kill_process_group(process: asyncio.subprocess.Process) -> None:
    if process.returncode is not None:
        return
    try:
        if os.name == "nt":
            process.kill()
        else:
            os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
