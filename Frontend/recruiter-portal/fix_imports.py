import os
import re

# Mapping of filenames to their new subdirectories
file_map = {
    'RecruiterLoginPage.tsx': 'auth',
    'Sidebar.tsx': 'layout',
    'Dashboard.tsx': 'dashboard',
    'EdgeCaseOverlays.tsx': 'shared',
    'SemanticSearchModal.tsx': 'shared',
    'TextRefiner.tsx': 'shared',
    'ProjectsPage.tsx': 'projects',
    'ProjectDetailPage.tsx': 'projects',
    'ProjectDetailView.tsx': 'projects',
    'ArchiveProjectModal.tsx': 'projects',
    'CompleteProjectModal.tsx': 'projects',
    'ClosePositionModal.tsx': 'projects',
    'EnhancedGroupOverviewV2.tsx': 'groups',
    'EnhancedGroupOverview.tsx': 'groups',
    'GroupOverview.tsx': 'groups',
    'GroupCreationPage.tsx': 'groups',
    'GroupCreationModal.tsx': 'groups',
    'EnhancedGroupCreationModal.tsx': 'groups',
    'SimpleGroupCreationModal.tsx': 'groups',
    'StartStageModal.tsx': 'groups',
    'FinalDecisionModal.tsx': 'groups',
    'BulkProgressionModal.tsx': 'groups',
    'FiltrationFlowConfigModal.tsx': 'groups',
    'EditAccessPrivilegesModal.tsx': 'groups',
    'ModuleMonitoringDashboard.tsx': 'groups',
    'StageResultsDashboard.tsx': 'groups',
    'CandidatesPage.tsx': 'candidates',
    'CandidateProfile.tsx': 'candidates',
    'CandidateProfileModal.tsx': 'candidates',
    'ApprovedCandidatesList.tsx': 'candidates',
    'AdvancedFiltersPanel.tsx': 'candidates',
    'AdvancedFilterDrawer.tsx': 'candidates',
    'KnowledgeGraph.tsx': 'candidates',
    'MiniKGPopover.tsx': 'candidates',
    'MiniKGTreePopover.tsx': 'candidates',
    'SkillClusteringWorkflow.tsx': 'candidates',
    'SuspectReviewPage.tsx': 'candidates',
    'SuspectReviewWrapper.tsx': 'candidates',
    'CreateAssessmentPage.tsx': 'assessments',
    'CreateAdvancedAssessment.tsx': 'assessments',
    'AssessmentSettings.tsx': 'assessments',
    'EnhancedAssessmentReport.tsx': 'assessments',
    'ModuleDetailAssessment.tsx': 'assessments',
    'QuestionBankPage.tsx': 'assessments',
    'QuestionBankModal.tsx': 'assessments',
    'CreateAIInterview.tsx': 'interviews',
    'AIInterviewSetupLive.tsx': 'interviews',
    'AIInterviewSetupRecorded.tsx': 'interviews',
    'AIGeneratorModal.tsx': 'interviews',
    'AIVariantMaker.tsx': 'interviews',
    'AIQuestionPreview.tsx': 'interviews',
    'EnhancedAIInterviewReport.tsx': 'interviews',
    'ModuleDetailAIInterview.tsx': 'interviews',
    'LiveInterviewTranscript.tsx': 'interviews',
    'RecordedInterviewQuestionSetup.tsx': 'interviews',
    'SectionEditor.tsx': 'interviews',
    'PositionDashboard.tsx': 'positions',
    'PositionDetailView.tsx': 'positions',
}

base_dir = r'c:\Users\ot\Documents\GitHub\EraMatch\Frontend\recruiter-portal\src\components\recruiter'

def update_file(filepath, filename):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # 1. Fix generic imports (up one level)
    # Replace ../../services with ../../../services, etc.
    content = content.replace("from '../../services", "from '../../../services")
    content = content.replace("from '../../hooks", "from '../../../hooks")
    content = content.replace("from '../../utils", "from '../../../utils")
    content = content.replace("from '../../types", "from '../../../types")
    content = content.replace("from '../../context", "from '../../../context")
    
    # 2. Fix common components import
    content = content.replace("from '../common", "from '../../common")

    # 3. Fix sibling imports
    # Look for imports like from './Something' or from './Something.tsx'
    # We need to find valid component filenames in imports
    
    # Import pattern: from './Component' or from './Component.tsx'
    # Also: import { Component } from './Component'
    
    def replace_sibling_import(match):
        # match.group(1) is the quote (', ")
        # match.group(2) is the path (e.g. ./SuspectReviewPage)
        quote = match.group(1)
        path = match.group(2)
        
        if not path.startswith('./'):
            return match.group(0)
            
        target = path[2:] # Strip ./
        if target.endswith('.tsx'):
            target = target[:-4]
        
        # Check against known files (try with .tsx suffix)
        target_file = target + '.tsx'
        
        current_subdir = file_map.get(filename)
        
        if target_file in file_map:
            target_subdir = file_map[target_file]
            if target_subdir == current_subdir:
                # Same directory, keep as is
                return match.group(0)
            else:
                # Different directory
                return f"from {quote}../{target_subdir}/{target}{quote}"
                
        return match.group(0)

    # Regex to find imports starting with ./
    # This is a simple regex and might miss complex cases, but covers most
    content = re.sub(r"from (['\"])(./[^'\"]+)(['\"])", replace_sibling_import, content)

    if content != original_content:
        print(f"Updating {filename}...")
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

# Iterate through all subdirectories
for subdir in ['auth', 'dashboard', 'layout', 'projects', 'groups', 'candidates', 'assessments', 'interviews', 'positions', 'shared']:
    dir_path = os.path.join(base_dir, subdir)
    if not os.path.exists(dir_path):
        continue
        
    for filename in os.listdir(dir_path):
        if filename.endswith('.tsx'):
            update_file(os.path.join(dir_path, filename), filename)

print("Finished updating imports.")
