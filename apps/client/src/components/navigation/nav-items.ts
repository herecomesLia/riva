import type { ComponentType } from 'react'
import {
  HistoryIcon,
  HomeIcon,
  InterviewIcon,
  PracticeIcon,
  ProfileIcon,
  RoleIcon,
} from './icons'

export type NavigationItem = {
  href: string
  icon: ComponentType<{ className?: string }>
  label: string
}

export const navigationItems = [
  { label: '工作台', href: '/dashboard', icon: HomeIcon },
  { label: '求职档案', href: '/resume/profile', icon: ProfileIcon },
  { label: '目标岗位', href: '/roles', icon: RoleIcon },
  { label: '专项练习', href: '/practice', icon: PracticeIcon },
  { label: '模拟面试', href: '/interview', icon: InterviewIcon },
  { label: '训练记录', href: '/history', icon: HistoryIcon },
] satisfies NavigationItem[]
