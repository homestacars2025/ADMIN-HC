import React, { useState } from 'react';
import { useNotificationCounts } from '../../hooks/useNotificationCounts';
import { AllNotificationsTab } from './AllNotificationsTab';
import { RulesTab } from './RulesTab';
import { SendNotificationTab } from './SendNotificationTab';
import { PAGE_STYLE, PageHeader, Tabs } from './ui';

type TabKey = 'all' | 'send' | 'rules';

const NotificationsPage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('all');
  const { unread } = useNotificationCounts();

  return (
    <div style={PAGE_STYLE}>
      <PageHeader
        eyebrow="Admin Tools"
        title="Notifications"
        subtitle="Everything that reached you, a direct line to the team, and the rules that turn system events into notifications."
      />

      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'all', label: 'All notifications', count: unread || undefined },
          { value: 'send', label: 'Send notification' },
          { value: 'rules', label: 'Rules' },
        ]}
      />

      {tab === 'all' && <AllNotificationsTab />}
      {tab === 'send' && <SendNotificationTab />}
      {tab === 'rules' && <RulesTab />}
    </div>
  );
};

export default NotificationsPage;
