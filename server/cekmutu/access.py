"""Who may do what, derived from the user's OJS roles and assignments.

Editor   journal manager (role 16) or site admin: every submission in the journal;
         section editor (role 17): submissions they are assigned to in OJS.
Reviewer only their own review assignments (not declined or cancelled).
Penulis  submissions where they are an author participant.
Editors see every checklist of a submission they can edit; everyone else sees
only their own.
"""
from functools import cached_property

from .ojs import ROLE_AUTHOR, ROLE_MANAGER, ROLE_REVIEWER, ROLE_SITE_ADMIN, ROLE_SUB_EDITOR


class Access:
    def __init__(self, ojs, user):
        self.ojs = ojs
        self.user = user
        self.uid = int(user['user_id'])

    @cached_property
    def groups(self):
        return self.ojs.user_groups(self.uid)

    @cached_property
    def is_admin(self):
        return any(g['role_id'] == ROLE_SITE_ADMIN for g in self.groups)

    @cached_property
    def manager_journals(self):
        return {g['context_id'] for g in self.groups if g['role_id'] == ROLE_MANAGER}

    @cached_property
    def subeditor_journals(self):
        return {g['context_id'] for g in self.groups if g['role_id'] == ROLE_SUB_EDITOR}

    @cached_property
    def reviews(self):
        return self.ojs.reviews_for_reviewer(self.uid)

    @cached_property
    def author_ids(self):
        return self.ojs.author_submission_ids(self.uid)

    @cached_property
    def journal_ids(self):
        if self.is_admin:
            return None  # all
        return {g['context_id'] for g in self.groups if g['context_id']}

    @cached_property
    def roles(self):
        out = []
        if self.is_admin or self.manager_journals or self.subeditor_journals:
            out.append('Editor')
        if self.reviews or any(g['role_id'] == ROLE_REVIEWER for g in self.groups):
            out.append('Reviewer')
        if self.author_ids or any(g['role_id'] == ROLE_AUTHOR for g in self.groups):
            out.append('Penulis')
        return out

    def editor_journal_ids(self, all_ids):
        if self.is_admin:
            return set(all_ids)
        return self.manager_journals | self.subeditor_journals

    def manages(self, journal_id):
        return self.is_admin or journal_id in self.manager_journals

    def edits(self, submission):
        """Editor access to one submission (dict from OJS.submission)."""
        if not submission:
            return False
        j = submission['journalId']
        if self.manages(j):
            return True
        return j in self.subeditor_journals and self.ojs.editor_assigned(self.uid, submission['id'])

    def review_for(self, review_id):
        return next((r for r in self.reviews if int(r['review_id']) == int(review_id)), None)

    def authors(self, submission_id):
        return int(submission_id) in {int(i) for i in self.author_ids}

    @cached_property
    def assigned_subeditor_ids(self):
        if not self.subeditor_journals:
            return set()
        rows = self.ojs.db.all(
            'SELECT DISTINCT sa.submission_id FROM stage_assignments sa JOIN user_groups ug ON ug.user_group_id = sa.user_group_id '
            'WHERE sa.user_id = %s AND ug.role_id IN (%s, %s)', (self.uid, ROLE_MANAGER, ROLE_SUB_EDITOR))
        return {r['submission_id'] for r in rows}
