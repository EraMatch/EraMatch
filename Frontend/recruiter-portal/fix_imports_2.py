import os

base_dir = r'c:\Users\ot\Documents\GitHub\EraMatch\Frontend\recruiter-portal\src\components\recruiter'

def update_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # Fix UI imports: ../ui -> ../../ui
    content = content.replace("from '../ui", "from '../../ui")
    
    # Fix any skipped common imports if any
    content = content.replace("from '../common", "from '../../common")

    if content != original_content:
        print(f"Updating {os.path.basename(filepath)}...")
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

# Iterate through all subdirectories
for subdir in ['auth', 'dashboard', 'layout', 'projects', 'groups', 'candidates', 'assessments', 'interviews', 'positions', 'shared']:
    dir_path = os.path.join(base_dir, subdir)
    if not os.path.exists(dir_path):
        continue
        
    for filename in os.listdir(dir_path):
        if filename.endswith('.tsx'):
            update_file(os.path.join(dir_path, filename))

print("Finished updating imports.")
