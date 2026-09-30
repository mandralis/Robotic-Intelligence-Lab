#!/bin/bash
# Double-click in Finder to publish a Project Desk brief on the lab website.
cd "$(dirname "$0")" && python3 publish-brief.py
