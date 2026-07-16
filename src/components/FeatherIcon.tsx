import type { SVGAttributes } from 'react'
import {
  Check,
  Grid,
  Key,
  Lock,
  LogIn,
  LogOut,
  Menu,
  Monitor,
  Moon,
  MoreVertical,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
  X,
} from 'react-feather'

const icons = {
  Check,
  Grid,
  Key,
  Lock,
  LogIn,
  LogOut,
  Menu,
  Monitor,
  Moon,
  MoreVertical,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
  X,
} as const

export type FeatherIconName = keyof typeof icons

type Props = SVGAttributes<SVGElement> & {
  name: FeatherIconName
  size?: number
}

export default function FeatherIcon({
  name,
  size = 16,
  className,
  ...rest
}: Props) {
  const Icon = icons[name]
  return <Icon size={size} className={className} strokeWidth={1.75} {...rest} />
}
