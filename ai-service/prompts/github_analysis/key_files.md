Identify the top 3 most important files to audit in this repository to verify the candidate's engineering quality with ZERO hallucination.

Context (README):
{readme_content}

File List:
{file_list}

INSTRUCTIONS:
1. Prioritize files with original business logic, complex data handling, or core architecture.
2. Avoid configuration files, tests (unless testing is the goal), or standard boilerplates.
3. Select EXACTLY the paths provided in the File List. DO NOT invent file paths.
4. If the file list is empty, return an empty list of files.

REQUIRED OUTPUT JSON FORMAT:
{
    "thought_process": "Explanation for why these specific files were chosen. Be factual.",
    "files": [
        {"path": "path/to/file.py", "reason": "Reason for selection"}
    ]
}

Return strict JSON only. No preamble.